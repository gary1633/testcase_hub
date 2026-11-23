import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  AutomationStatus,
  CiIngestResultDto,
  CiTokenDto,
  CreatedCiTokenDto,
  ExecutionStatus,
  Priority,
  Severity,
  TestCaseStatus,
  TestCaseType,
} from '@tcms/shared';
import { DatabaseService } from '../db/database.service';
import {
  projectApiTokens,
  projects,
  suites,
  testCases,
  testRunResults,
  testRuns,
  testSteps,
  users,
} from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { computeRunStats } from '../test-runs/test-runs.service';
import { WebhookService } from '../webhook/webhook.service';

interface ParsedCiCase {
  title: string;
  status: ExecutionStatus;
  actualResult: string;
}

interface PlaywrightSuiteNode {
  title?: string;
  suites?: PlaywrightSuiteNode[];
  specs?: Array<{
    title?: string;
    ok?: boolean;
    tests?: Array<{
      projectName?: string;
      status?: string;
      results?: Array<{
        status?: string;
        duration?: number;
        error?: { message?: string };
        errors?: Array<{ message?: string }>;
      }>;
    }>;
  }>;
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function readXmlAttr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return decodeXmlEntities(m?.[1] ?? m?.[2] ?? '');
}

export function parsePlaywrightJson(payload: Record<string, unknown>): ParsedCiCase[] {
  const results: ParsedCiCase[] = [];
  const rootSuites = Array.isArray(payload.suites)
    ? (payload.suites as PlaywrightSuiteNode[])
    : [];

  const visitSuite = (suite: PlaywrightSuiteNode, path: string[]) => {
    const nextPath = suite.title ? [...path, suite.title] : path;
    for (const spec of suite.specs ?? []) {
      const specTitle = spec.title || 'Unnamed spec';
      const tests = spec.tests ?? [];
      if (tests.length === 0) {
        results.push({
          title: [...nextPath, specTitle].join(' › '),
          status: spec.ok === false ? 'FAILED' : 'PASSED',
          actualResult: spec.ok === false ? 'Playwright spec failed' : 'Playwright spec passed',
        });
        continue;
      }

      for (const test of tests) {
        const lastRun = test.results?.[test.results.length - 1];
        const rawStatus = (lastRun?.status || test.status || '').toLowerCase();
        let status: ExecutionStatus = 'PASSED';
        if (rawStatus === 'failed' || rawStatus === 'timedout' || rawStatus === 'interrupted' || rawStatus === 'unexpected') {
          status = 'FAILED';
        } else if (rawStatus === 'skipped') {
          status = 'NOT_TEST';
        }
        const errMsg =
          lastRun?.error?.message ||
          lastRun?.errors?.map((e) => e.message).filter(Boolean).join('\n') ||
          '';
        const durationLabel =
          typeof lastRun?.duration === 'number' ? ` (${lastRun.duration} ms)` : '';
        const prefix = test.projectName ? `[${test.projectName}] ` : '';
        const fullTitle = `${prefix}${specTitle}`;

        results.push({
          title: fullTitle,
          status,
          actualResult:
            status === 'FAILED'
              ? `${errMsg || 'Test failed'}${durationLabel}`.slice(0, 2000)
              : status === 'NOT_TEST'
                ? `Skipped in Playwright CI${durationLabel}`
                : `Passed in Playwright CI${durationLabel}`,
        });
      }
    }

    for (const child of suite.suites ?? []) {
      visitSuite(child, nextPath);
    }
  };

  for (const s of rootSuites) {
    visitSuite(s, []);
  }
  return results;
}

export function parseJunitXml(xml: string): ParsedCiCase[] {
  const results: ParsedCiCase[] = [];
  const caseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  let match: RegExpExecArray | null;

  while ((match = caseRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const name = readXmlAttr(attrs, 'name') || 'Unnamed test';
    const classname = readXmlAttr(attrs, 'classname');
    const timeSec = readXmlAttr(attrs, 'time');

    const failMatch = inner.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/i);
    const selfFailMatch = inner.match(/<(failure|error)\b([^>]*)\/>/i);
    const skippedMatch = inner.match(/<skipped\b([^>]*)>([\s\S]*?)<\/skipped>|<skipped\b([^>]*)\/>/i);

    let status: ExecutionStatus = 'PASSED';
    let detail = timeSec ? `Passed in CI (${timeSec}s)` : 'Passed in CI';

    if (failMatch || selfFailMatch) {
      status = 'FAILED';
      const fAttrs = (failMatch?.[2] ?? selfFailMatch?.[2] ?? '');
      const fMsg = readXmlAttr(fAttrs, 'message');
      const fBody = decodeXmlEntities(failMatch?.[3] ?? '');
      detail = [fMsg, fBody].filter(Boolean).join('\n').slice(0, 2000) || 'Assertion failed';
    } else if (skippedMatch) {
      status = 'NOT_TEST';
      const sAttrs = skippedMatch[1] ?? skippedMatch[3] ?? '';
      detail = readXmlAttr(sAttrs, 'message') || 'Skipped in CI';
    }

    const title = classname && !name.includes(classname) ? `${classname} › ${name}` : name;
    results.push({ title, status, actualResult: detail });
  }

  return results;
}

@Injectable()
export class CiService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
    private readonly webhookService: WebhookService,
  ) {}

  async listTokens(projectId: string, user: AuthUser): Promise<CiTokenDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;

    const rows = await db
      .select()
      .from(projectApiTokens)
      .where(and(eq(projectApiTokens.projectId, projectId), isNull(projectApiTokens.revokedAt)))
      .orderBy(desc(projectApiTokens.createdAt));

    const creatorIds = Array.from(new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[]));
    const userRows =
      creatorIds.length > 0
        ? await db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, creatorIds))
        : [];
    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      tokenPrefix: r.tokenPrefix,
      createdByName: r.createdBy ? userMap.get(r.createdBy) ?? null : null,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createToken(
    projectId: string,
    user: AuthUser,
    name: string,
  ): Promise<CreatedCiTokenDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Vui lòng nhập tên API Token');
    }

    const rawToken = `tcms_${crypto.randomBytes(24).toString('hex')}`;
    const [created] = await this.dbService.db
      .insert(projectApiTokens)
      .values({
        projectId,
        name: trimmed,
        tokenPrefix: rawToken.slice(0, 13),
        tokenHash: hashToken(rawToken),
        createdBy: user.id,
      })
      .returning();

    return {
      id: created.id,
      name: created.name,
      tokenPrefix: created.tokenPrefix,
      createdByName: user.fullName,
      lastUsedAt: null,
      createdAt: created.createdAt.toISOString(),
      token: rawToken,
    };
  }

  async revokeToken(
    projectId: string,
    tokenId: string,
    user: AuthUser,
  ): Promise<{ revoked: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const [existing] = await this.dbService.db
      .select()
      .from(projectApiTokens)
      .where(and(eq(projectApiTokens.id, tokenId), eq(projectApiTokens.projectId, projectId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy API Token');
    }

    await this.dbService.db
      .update(projectApiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(projectApiTokens.id, tokenId));

    return { revoked: true };
  }

  async ingestReport(
    rawToken: string | undefined,
    rawBody: unknown,
    query: {
      title?: string;
      environment?: string;
      appVersion?: string;
      jiraIssueKey?: string;
      format?: string;
    },
  ): Promise<CiIngestResultDto> {
    const token = rawToken?.trim();
    if (!token || !token.startsWith('tcms_')) {
      throw new UnauthorizedException('Thiếu hoặc sai Project API Token (X-Project-Token / Bearer tcms_...)');
    }

    const db = this.dbService.db;
    const [tokenRow] = await db
      .select()
      .from(projectApiTokens)
      .where(and(eq(projectApiTokens.tokenHash, hashToken(token)), isNull(projectApiTokens.revokedAt)))
      .limit(1);

    if (!tokenRow) {
      throw new UnauthorizedException('API Token không hợp lệ hoặc đã bị thu hồi');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, tokenRow.projectId))
      .limit(1);
    if (!project || project.isArchived) {
      throw new NotFoundException('Dự án không tồn tại hoặc đã lưu trữ');
    }

    await db
      .update(projectApiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(projectApiTokens.id, tokenRow.id));

    let detectedFormat: 'playwright' | 'junit' = 'playwright';
    let parsedCases: ParsedCiCase[] = [];
    let metaTitle = query.title?.trim() || '';
    let metaEnv = query.environment?.trim() || 'CI/CD';
    let metaVer = query.appVersion?.trim() || '1.0.0';
    let metaJira = query.jiraIssueKey?.trim().toUpperCase() || null;

    if (typeof rawBody === 'string') {
      const xmlStr = rawBody.trim();
      if (!xmlStr.startsWith('<')) {
        throw new BadRequestException('Nội dung XML không hợp lệ');
      }
      detectedFormat = 'junit';
      parsedCases = parseJunitXml(xmlStr);
    } else if (rawBody && typeof rawBody === 'object') {
      const obj = rawBody as Record<string, unknown>;
      if (typeof obj.title === 'string' && obj.title.trim()) metaTitle = obj.title.trim();
      if (typeof obj.environment === 'string' && obj.environment.trim()) {
        metaEnv = obj.environment.trim();
      }
      if (typeof obj.appVersion === 'string' && obj.appVersion.trim()) {
        metaVer = obj.appVersion.trim();
      }
      if (typeof obj.jiraIssueKey === 'string' && obj.jiraIssueKey.trim()) {
        metaJira = obj.jiraIssueKey.trim().toUpperCase();
      }

      const xmlCandidate =
        typeof obj.xml === 'string'
          ? obj.xml
          : typeof obj.junitXml === 'string'
            ? obj.junitXml
            : null;
      if (xmlCandidate || query.format === 'junit') {
        detectedFormat = 'junit';
        parsedCases = parseJunitXml(xmlCandidate ?? '');
      } else {
        detectedFormat = 'playwright';
        const reportObj =
          obj.report && typeof obj.report === 'object'
            ? (obj.report as Record<string, unknown>)
            : obj;
        parsedCases = parsePlaywrightJson(reportObj);
      }
    } else {
      throw new BadRequestException('Payload CI/CD rỗng hoặc không đúng định dạng');
    }

    if (parsedCases.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy test case nào trong file Playwright JSON hoặc JUnit XML',
      );
    }

    const [repoCases, repoSuites] = await Promise.all([
      db
        .select()
        .from(testCases)
        .where(and(eq(testCases.projectId, project.id), isNull(testCases.deletedAt))),
      db
        .select()
        .from(suites)
        .where(and(eq(suites.projectId, project.id), isNull(suites.deletedAt))),
    ]);

    const suiteMap = new Map(repoSuites.map((s) => [s.id, s.title]));
    const caseBySeq = new Map(repoCases.map((c) => [c.seqNumber, c]));
    const caseByTitle = new Map(repoCases.map((c) => [c.title.trim().toLowerCase(), c]));

    const matchedIds = new Set<string>();
    const codeRegex = new RegExp(`\\b${project.code}-(\\d+)\\b`, 'i');
    const resolvedMatches = parsedCases.map((item) => {
      const m = item.title.match(codeRegex);
      let matched = m ? caseBySeq.get(Number(m[1])) : undefined;
      if (!matched) {
        matched = caseByTitle.get(item.title.trim().toLowerCase());
      }
      if (matched) matchedIds.add(matched.id);
      return { item, matched };
    });

    const stepRows =
      matchedIds.size > 0
        ? await db
            .select()
            .from(testSteps)
            .where(inArray(testSteps.testCaseId, Array.from(matchedIds)))
            .orderBy(asc(testSteps.stepOrder))
        : [];
    const stepsByCase = new Map<string, Array<typeof testSteps.$inferSelect>>();
    for (const st of stepRows) {
      const arr = stepsByCase.get(st.testCaseId) ?? [];
      arr.push(st);
      stepsByCase.set(st.testCaseId, arr);
    }

    const runTitle =
      metaTitle ||
      `[CI ${detectedFormat.toUpperCase()}] ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const now = new Date();

    const [run] = await db
      .insert(testRuns)
      .values({
        projectId: project.id,
        title: runTitle,
        description: `Tự động đẩy từ CI/CD (${detectedFormat.toUpperCase()}) qua token "${tokenRow.name}"`,
        environment: metaEnv,
        appVersion: metaVer,
        jiraIssueKey: metaJira,
        source: 'CI_CD',
        status: 'COMPLETED',
        createdBy: tokenRow.createdBy,
        startedAt: now,
        completedAt: now,
      })
      .returning();

    let extSeq = 0;
    const resultValues = resolvedMatches.map(({ item, matched }, idx) => {
      if (matched) {
        const cSteps = stepsByCase.get(matched.id) ?? [];
        return {
          runId: run.id,
          testCaseId: matched.id,
          caseCode: `${project.code}-${matched.seqNumber}`,
          caseVersion: matched.currentVersion || 1,
          caseSnapshot: {
            title: matched.title,
            suiteId: matched.suiteId,
            suiteTitle: matched.suiteId ? suiteMap.get(matched.suiteId) ?? null : null,
            description: matched.description,
            preconditions: matched.preconditions,
            priority: matched.priority as Priority,
            severity: matched.severity as Severity,
            type: matched.type as TestCaseType,
            automationStatus: matched.automationStatus as AutomationStatus,
            status: matched.status as TestCaseStatus,
            tags: Array.isArray(matched.tags) ? matched.tags : [],
            jiraIssueKeys: Array.isArray(matched.jiraIssueKeys) ? matched.jiraIssueKeys : [],
            steps: cSteps.map((s, order) => ({
              stepOrder: order,
              action: s.action,
              data: s.data,
              expectedResult: s.expectedResult,
            })),
          },
          status: item.status,
          actualResult: item.actualResult,
          executedBy: tokenRow.createdBy,
          executedAt: now,
          position: idx,
        };
      }

      extSeq += 1;
      return {
        runId: run.id,
        testCaseId: null,
        caseCode: `CI-${extSeq}`,
        caseVersion: 1,
        caseSnapshot: {
          title: item.title.slice(0, 480),
          suiteId: null,
          suiteTitle: `CI/CD (${detectedFormat.toUpperCase()})`,
          description: '',
          preconditions: '',
          priority: 'MEDIUM' as Priority,
          severity: 'NORMAL' as Severity,
          type: 'FUNCTIONAL' as TestCaseType,
          automationStatus: 'AUTOMATED' as AutomationStatus,
          status: 'ACTIVE' as TestCaseStatus,
          tags: ['ci-cd'],
          jiraIssueKeys: [],
          steps: [],
        },
        status: item.status,
        actualResult: item.actualResult,
        executedBy: tokenRow.createdBy,
        executedAt: now,
        position: idx,
      };
    });

    await db.insert(testRunResults).values(resultValues);

    const passed = resultValues.filter((r) => r.status === 'PASSED').length;
    const failed = resultValues.filter((r) => r.status === 'FAILED').length;
    const skipped = resultValues.filter((r) => r.status === 'NOT_TEST').length;

    const stats = computeRunStats(resultValues.map((r) => r.status));
    void this.webhookService.notifyRunCompleted(project.id, {
      runTitle: run.title,
      environment: run.environment,
      appVersion: run.appVersion,
      source: 'CI_CD',
      stats,
      actorName: `CI Token (${tokenRow.name})`,
    });

    return {
      runId: run.id,
      runTitle: run.title,
      format: detectedFormat,
      totalTests: resultValues.length,
      matchedCases: matchedIds.size,
      passed,
      failed,
      skipped,
    };
  }
}
