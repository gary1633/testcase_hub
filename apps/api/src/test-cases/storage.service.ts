import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const BLOCKED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.xml',
  '.xsl',
  '.xslt',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.php',
  '.phtml',
  '.jsp',
  '.asp',
  '.aspx',
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.bash',
  '.msi',
  '.vbs',
  '.hta',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.pdf',
  '.txt',
  '.log',
  '.md',
  '.csv',
  '.json',
  '.xlsx',
  '.xls',
  '.docx',
  '.doc',
  '.pptx',
  '.zip',
  '.mp4',
  '.webm',
  '.mov',
]);

const BLOCKED_MIME_PREFIXES = ['text/html', 'application/xhtml', 'image/svg', 'application/javascript', 'text/javascript'];

const SAFE_INLINE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

@Injectable()
export class StorageService {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  validateUploadFile(originalName: string, mimeType?: string): string {
    const ext = path.extname(originalName || '').toLowerCase();
    const cleanMime = (mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();

    if (BLOCKED_EXTENSIONS.has(ext) || BLOCKED_MIME_PREFIXES.some((p) => cleanMime.startsWith(p))) {
      throw new BadRequestException(
        `Định dạng tệp "${ext || cleanMime}" bị chặn vì lý do bảo mật (không cho phép HTML, SVG hoặc script thực thi).`,
      );
    }

    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `Định dạng tệp "${ext}" chưa được hỗ trợ. Chỉ chấp nhận ảnh (PNG/JPG/WEBP/GIF), PDF, Office/CSV/JSON/TXT/LOG, ZIP hoặc Video (MP4/WEBM).`,
      );
    }

    return cleanMime;
  }

  isSafeInlineMime(mimeType?: string | null): boolean {
    const cleanMime = (mimeType || '').split(';')[0].trim().toLowerCase();
    return SAFE_INLINE_MIMES.has(cleanMime);
  }

  saveBuffer(originalName: string, buffer: Buffer): string {
    const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    const key = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const targetPath = path.join(this.uploadDir, key);
    fs.writeFileSync(targetPath, buffer);
    return key;
  }

  getFilePath(storageKey: string): string | null {
    const safeKey = path.basename(storageKey);
    const fullPath = path.join(this.uploadDir, safeKey);
    return fs.existsSync(fullPath) ? fullPath : null;
  }

  deleteFile(storageKey: string): void {
    const fullPath = this.getFilePath(storageKey);
    if (fullPath) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // ignore missing file
      }
    }
  }
}
