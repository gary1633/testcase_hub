import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as path from 'path';
import { eq, sql } from 'drizzle-orm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { DatabaseService } from '../db/database.service';
import { testRunResults, testRuns } from '../db/schema';
import { StorageService } from '../test-cases/storage.service';

@ApiTags('Run Evidence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('run-evidence')
export class RunEvidenceController {
  constructor(
    private readonly storageService: StorageService,
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @Get(':storageKey')
  async serve(
    @Param('storageKey') storageKey: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const safeKey = path.basename(storageKey);

    // Lookup owning project via DB evidence JSONB so non-members cannot IDOR evidence across projects
    const rows = await this.dbService.db
      .select({
        projectId: testRuns.projectId,
        evidence: testRunResults.evidence,
      })
      .from(testRunResults)
      .innerJoin(testRuns, eq(testRunResults.runId, testRuns.id))
      .where(sql`${testRunResults.evidence} @> ${JSON.stringify([{ storageKey: safeKey }])}::jsonb`)
      .limit(1);

    const match = rows[0];
    if (!match) {
      throw new NotFoundException('Không tìm thấy tệp bằng chứng');
    }

    await this.projectAccess.verifyAccess(match.projectId, user, 'view');

    const filePath = this.storageService.getFilePath(safeKey);
    if (!filePath) {
      throw new NotFoundException('Không tìm thấy tệp bằng chứng');
    }

    const evItem = Array.isArray(match.evidence)
      ? match.evidence.find((e) => e.storageKey === safeKey)
      : undefined;
    const isSafeInline = this.storageService.isSafeInlineMime(evItem?.mimeType);
    const disposition = isSafeInline ? 'inline' : 'attachment';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Type',
      isSafeInline && evItem?.mimeType ? evItem.mimeType : 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(evItem?.fileName || safeKey)}"`,
    );
    res.sendFile(filePath);
  }
}
