import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { projectIntegrations, type JiraIntegrationRawConfig } from '../db/schema';
import { assertSafeOutboundUrl } from '../common/url-security.util';
import type { DefectSeverity, TestRunStatsDto } from '@tcms/shared';

function toAdfParagraph(text: string) {
  return {
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : [],
  };
}

function toAdfHeading(text: string, level = 3) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function mapSeverityToJiraPriority(sev: DefectSeverity): string {
  switch (sev) {
    case 'HIGHEST':
      return 'Highest';
    case 'HIGH':
      return 'High';
    case 'LOW':
      return 'Low';
    case 'MEDIUM':
    default:
      return 'Medium';
  }
}

@Injectable()
export class JiraService {
  constructor(private readonly dbService: DatabaseService) {}

  async getEnabledConfig(projectId: string): Promise<JiraIntegrationRawConfig | null> {
    const [row] = await this.dbService.db
      .select()
      .from(projectIntegrations)
      .where(
        and(
          eq(projectIntegrations.projectId, projectId),
          eq(projectIntegrations.provider, 'jira'),
        ),
      )
      .limit(1);

    if (!row || !row.isEnabled) return null;
    if (!row.config?.baseUrl || !row.config?.email || !row.config?.apiToken) return null;
    return row.config;
  }

  async createJiraBug(
    projectId: string,
    payload: {
      summary: string;
      description: string;
      severity: DefectSeverity;
      caseCode?: string | null;
      environment?: string;
      appVersion?: string;
      stepsText?: string;
      expectedText?: string;
      actualResult?: string;
      parentJiraKey?: string | null;
    },
  ): Promise<{ ok: boolean; issueKey?: string; issueUrl?: string; message: string }> {
    const config = await this.getEnabledConfig(projectId);
    if (!config) {
      return {
        ok: false,
        message:
          'Dự án chưa kích hoạt hoặc chưa điền đầy đủ Jira Base URL / Email / API Token trong mục Cài đặt & Jira.',
      };
    }

    let baseUrl: string;
    try {
      baseUrl = await assertSafeOutboundUrl(config.baseUrl, 'Jira Base URL');
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Jira Base URL không hợp lệ',
      };
    }
    const authHeader =
      'Basic ' + Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    const adfContent: unknown[] = [];
    if (payload.description) {
      adfContent.push(toAdfParagraph(payload.description));
    }
    const metaLines: string[] = [];
    if (payload.caseCode) metaLines.push(`Test Case: ${payload.caseCode}`);
    if (payload.environment) metaLines.push(`Môi trường: ${payload.environment}`);
    if (payload.appVersion) metaLines.push(`Phiên bản: ${payload.appVersion}`);
    if (payload.parentJiraKey) metaLines.push(`Liên quan Ticket: ${payload.parentJiraKey}`);
    if (metaLines.length > 0) {
      adfContent.push(toAdfHeading('Thông tin kiểm thử (FinX TestCase Hub)'));
      adfContent.push(toAdfParagraph(metaLines.join(' | ')));
    }
    if (payload.stepsText) {
      adfContent.push(toAdfHeading('Các bước tái hiện (Steps)'));
      adfContent.push(toAdfParagraph(payload.stepsText));
    }
    if (payload.expectedText) {
      adfContent.push(toAdfHeading('Kết quả mong đợi (Expected Result)'));
      adfContent.push(toAdfParagraph(payload.expectedText));
    }
    if (payload.actualResult) {
      adfContent.push(toAdfHeading('Kết quả thực tế (Actual Result)'));
      adfContent.push(toAdfParagraph(payload.actualResult));
    }

    const body = {
      fields: {
        project: { key: config.projectKey },
        summary: payload.summary,
        issuetype: { name: config.defaultIssueType || 'Bug' },
        priority: { name: mapSeverityToJiraPriority(payload.severity) },
        description: {
          type: 'doc',
          version: 1,
          content: adfContent.length > 0 ? adfContent : [toAdfParagraph(payload.summary)],
        },
      },
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          ok: false,
          message: `Jira từ chối tạo issue (HTTP ${res.status}): ${errText.slice(0, 240)}`,
        };
      }

      const data = (await res.json()) as { key: string };
      const issueUrl = `${baseUrl}/browse/${data.key}`;
      return {
        ok: true,
        issueKey: data.key,
        issueUrl,
        message: `Đã tạo Bug trên Jira thành công: ${data.key}`,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      return {
        ok: false,
        message: `Không thể kết nối Jira (${baseUrl}): ${reason}`,
      };
    }
  }

  async syncRunProgressToJira(
    projectId: string,
    targetIssueKey: string,
    payload: {
      runTitle: string;
      environment: string;
      appVersion: string;
      stats: TestRunStatsDto;
      failedCases: Array<{ code: string; title: string; actualResult: string; bugs: string[] }>;
      syncedByName: string;
    },
  ): Promise<{ ok: boolean; issueUrl?: string; message: string }> {
    const config = await this.getEnabledConfig(projectId);
    if (!config) {
      return {
        ok: false,
        message:
          'Dự án chưa kích hoạt hoặc chưa cấu hình Jira API Token trong mục Cài đặt & Jira.',
      };
    }

    let baseUrl: string;
    try {
      baseUrl = await assertSafeOutboundUrl(config.baseUrl, 'Jira Base URL');
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Jira Base URL không hợp lệ',
      };
    }
    const authHeader =
      'Basic ' + Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const cleanKey = targetIssueKey.trim().toUpperCase();

    const s = payload.stats;
    const summaryLine = `Total: ${s.total} | Passed: ${s.passed} | Failed: ${s.failed} | Blocked: ${s.blocked} | Not Test: ${s.notTest} | Not Executed: ${s.notExecuted} | Pass Rate: ${s.passRate}%`;

    const content: unknown[] = [
      toAdfHeading(`[FinX TestCase Hub] Tiến độ Test Run: ${payload.runTitle}`, 3),
      toAdfParagraph(
        `Môi trường: ${payload.environment} | Phiên bản: ${payload.appVersion} | Cập nhật bởi: ${payload.syncedByName} (${new Date().toLocaleString('vi-VN')})`,
      ),
      toAdfParagraph(summaryLine),
    ];

    if (payload.failedCases.length > 0) {
      content.push(toAdfHeading(`Danh sách Test Case Failed (${payload.failedCases.length})`, 4));
      const lines = payload.failedCases.map(
        (fc) =>
          `• ${fc.code}: ${fc.title}${fc.bugs.length > 0 ? ` [Bug: ${fc.bugs.join(', ')}]` : ''}${
            fc.actualResult ? ` — Thực tế: ${fc.actualResult.slice(0, 140)}` : ''
          }`,
      );
      content.push(toAdfParagraph(lines.join('\n')));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(cleanKey)}/comment`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content,
          },
        }),
        redirect: 'error',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          ok: false,
          message: `Jira từ chối đăng comment lên ${cleanKey} (HTTP ${res.status}): ${errText.slice(0, 240)}`,
        };
      }

      return {
        ok: true,
        issueUrl: `${baseUrl}/browse/${cleanKey}`,
        message: `Đã đồng bộ tiến độ Test Run lên ticket Jira ${cleanKey} thành công!`,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      return {
        ok: false,
        message: `Không thể kết nối Jira (${baseUrl}): ${reason}`,
      };
    }
  }
}
