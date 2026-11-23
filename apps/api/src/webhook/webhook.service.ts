import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type {
  DefectSeverity,
  TestRunStatsDto,
  WebhookConfigDto,
  WebhookProvider,
} from '@tcms/shared';
import { DatabaseService } from '../db/database.service';
import { projects, projectWebhooks } from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { assertSafeOutboundUrl, validateSafeExternalUrl } from '../common/url-security.util';

function maskWebhookUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const tail = url.length > 10 ? url.slice(-4) : '';
    return `${u.protocol}//${u.host}/••••••••${tail}`;
  } catch {
    return '••••••••';
  }
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async getConfig(projectId: string, user: AuthUser): Promise<WebhookConfigDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const [row] = await this.dbService.db
      .select()
      .from(projectWebhooks)
      .where(eq(projectWebhooks.projectId, projectId))
      .limit(1);

    if (!row) {
      return {
        isEnabled: false,
        provider: 'SLACK',
        webhookUrl: '',
        hasWebhookUrl: false,
        notifyOnRunCompleted: true,
        notifyOnHighDefect: true,
      };
    }

    return {
      isEnabled: row.isEnabled,
      provider: row.provider as WebhookProvider,
      webhookUrl: maskWebhookUrl(row.webhookUrl),
      hasWebhookUrl: Boolean(row.webhookUrl),
      notifyOnRunCompleted: row.notifyOnRunCompleted,
      notifyOnHighDefect: row.notifyOnHighDefect,
    };
  }

  async saveConfig(
    projectId: string,
    user: AuthUser,
    input: {
      provider: WebhookProvider;
      webhookUrl?: string;
      isEnabled: boolean;
      notifyOnRunCompleted: boolean;
      notifyOnHighDefect: boolean;
    },
  ): Promise<WebhookConfigDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(projectWebhooks)
      .where(eq(projectWebhooks.projectId, projectId))
      .limit(1);

    const incomingUrl = input.webhookUrl?.trim() ?? '';
    let finalUrl = existing?.webhookUrl ?? '';

    if (incomingUrl && !incomingUrl.includes('••••')) {
      const normalized = validateSafeExternalUrl(incomingUrl, 'Webhook URL');
      await assertSafeOutboundUrl(normalized, 'Webhook URL');
      finalUrl = normalized;
    }

    if (input.isEnabled && !finalUrl) {
      throw new BadRequestException('Vui lòng nhập Webhook URL trước khi kích hoạt');
    }

    if (existing) {
      await db
        .update(projectWebhooks)
        .set({
          provider: input.provider,
          webhookUrl: finalUrl,
          isEnabled: input.isEnabled,
          notifyOnRunCompleted: input.notifyOnRunCompleted,
          notifyOnHighDefect: input.notifyOnHighDefect,
          updatedAt: new Date(),
        })
        .where(eq(projectWebhooks.id, existing.id));
    } else {
      await db.insert(projectWebhooks).values({
        projectId,
        provider: input.provider,
        webhookUrl: finalUrl,
        isEnabled: input.isEnabled,
        notifyOnRunCompleted: input.notifyOnRunCompleted,
        notifyOnHighDefect: input.notifyOnHighDefect,
      });
    }

    return this.getConfig(projectId, user);
  }

  async sendTestMessage(
    projectId: string,
    user: AuthUser,
  ): Promise<{ ok: boolean; message: string }> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const [row] = await this.dbService.db
      .select()
      .from(projectWebhooks)
      .where(eq(projectWebhooks.projectId, projectId))
      .limit(1);

    if (!row || !row.webhookUrl) {
      return { ok: false, message: 'Chưa cấu hình Webhook URL cho dự án.' };
    }

    return this.dispatchPayload(row.provider as WebhookProvider, row.webhookUrl, {
      title: `[${project.code}] Kiểm tra kết nối Webhook thành công`,
      text:
        `FinX TestCase Hub kết nối thành công với kênh thông báo (${row.provider}).\n` +
        `Dự án: ${project.name} (${project.code})\n` +
        `Thực hiện bởi: ${user.fullName}`,
      accentColor: '#851FB6',
    });
  }

  async notifyRunCompleted(
    projectId: string,
    payload: {
      runTitle: string;
      environment: string;
      appVersion: string;
      source?: string;
      stats: TestRunStatsDto;
      actorName: string;
    },
  ): Promise<void> {
    try {
      const [row] = await this.dbService.db
        .select()
        .from(projectWebhooks)
        .where(eq(projectWebhooks.projectId, projectId))
        .limit(1);

      if (!row || !row.isEnabled || !row.notifyOnRunCompleted || !row.webhookUrl) {
        return;
      }

      const [project] = await this.dbService.db
        .select({ code: projects.code, name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      const s = payload.stats;
      const prefix = payload.source === 'CI_CD' ? '[CI/CD Run]' : '[Test Run]';
      const title = `${prefix} ${project?.code ?? ''} — Hoàn tất: ${payload.runTitle}`;
      const text =
        `Dự án: ${project?.name ?? projectId} (${project?.code ?? ''})\n` +
        `Môi trường: ${payload.environment} · Build v${payload.appVersion}\n` +
        `Pass Rate: ${s.passRate}% | Passed: ${s.passed} · Failed: ${s.failed} · Blocked: ${s.blocked} · Tổng: ${s.total}\n` +
        `Người xác nhận: ${payload.actorName}`;

      await this.dispatchPayload(row.provider as WebhookProvider, row.webhookUrl, {
        title,
        text,
        accentColor: s.failed > 0 ? '#D92D20' : '#027A48',
      });
    } catch (err) {
      this.logger.warn(`Webhook notifyRunCompleted failed: ${String(err)}`);
    }
  }

  async notifyHighDefect(
    projectId: string,
    payload: {
      defectTitle: string;
      severity: DefectSeverity;
      caseCode?: string | null;
      jiraIssueKey?: string | null;
      reporterName: string;
    },
  ): Promise<void> {
    if (payload.severity !== 'HIGHEST') return;

    try {
      const [row] = await this.dbService.db
        .select()
        .from(projectWebhooks)
        .where(eq(projectWebhooks.projectId, projectId))
        .limit(1);

      if (!row || !row.isEnabled || !row.notifyOnHighDefect || !row.webhookUrl) {
        return;
      }

      const [project] = await this.dbService.db
        .select({ code: projects.code, name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      const title = `[BUG HIGHEST] ${project?.code ?? ''} — ${payload.defectTitle}`;
      const text =
        `Mức độ: HIGHEST (Nghiêm trọng)\n` +
        (payload.caseCode ? `Test Case: ${payload.caseCode}\n` : '') +
        (payload.jiraIssueKey ? `Jira Key: ${payload.jiraIssueKey}\n` : '') +
        `Người báo cáo: ${payload.reporterName}`;

      await this.dispatchPayload(row.provider as WebhookProvider, row.webhookUrl, {
        title,
        text,
        accentColor: '#D92D20',
      });
    } catch (err) {
      this.logger.warn(`Webhook notifyHighDefect failed: ${String(err)}`);
    }
  }

  private async dispatchPayload(
    provider: WebhookProvider,
    rawUrl: string,
    msg: { title: string; text: string; accentColor: string },
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const safeUrl = validateSafeExternalUrl(rawUrl, 'Webhook URL');
      await assertSafeOutboundUrl(safeUrl, 'Webhook URL');

      let body: Record<string, unknown>;
      if (provider === 'TEAMS') {
        body = {
          '@type': 'MessageCard',
          '@context': 'http://schema.org/extensions',
          themeColor: msg.accentColor.replace('#', ''),
          summary: msg.title,
          title: msg.title,
          text: msg.text.replace(/\n/g, '  \n'),
        };
      } else if (provider === 'GOOGLE_CHAT') {
        body = {
          text: `*${msg.title}*\n${msg.text}`,
        };
      } else {
        // SLACK & CUSTOM compatible format
        body = {
          text: `*${msg.title}*\n${msg.text}`,
          attachments: [
            {
              color: msg.accentColor,
              title: msg.title,
              text: msg.text,
            },
          ],
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(safeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const detail = (await resp.text().catch(() => '')).slice(0, 200);
          return {
            ok: false,
            message: `Webhook trả về HTTP ${resp.status}: ${detail || resp.statusText}`,
          };
        }
        return { ok: true, message: 'Đã gửi thông báo Webhook thành công!' };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Không thể gửi request Webhook',
      };
    }
  }
}
