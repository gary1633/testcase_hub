import { Controller, Delete, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { StorageService } from './storage.service';
import { TestCasesService } from './test-cases.service';

@ApiTags('Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly testCasesService: TestCasesService,
    private readonly storageService: StorageService,
  ) {}

  @Get(':id')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { attachment, filePath } = await this.testCasesService.getAttachmentForDownload(id, user);
    const isSafeInline = this.storageService.isSafeInlineMime(attachment.mimeType);
    const disposition = isSafeInline ? 'inline' : 'attachment';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Type',
      isSafeInline ? attachment.mimeType : 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    res.sendFile(filePath);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.testCasesService.deleteAttachment(id, user);
  }
}
