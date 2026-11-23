import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export function isSmtpConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const host = (env.SMTP_HOST || '').trim();
  const user = (env.SMTP_USER || '').trim();
  const pass = (env.SMTP_PASS || '').trim();
  return Boolean(host && user && pass);
}

export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const cors = (env.CORS_ORIGIN || '').split(',')[0]?.trim().replace(/\/+$/, '');
  return cors || 'http://localhost:8080';
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private cachedSignature = '';

  isEnabled(): boolean {
    return isSmtpConfigured(process.env);
  }

  private getTransporter(): Transporter | null {
    if (!this.isEnabled()) return null;

    const host = (process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || 587) || 587;
    const secure =
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE.trim().toLowerCase() === 'true'
        : port === 465;
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').trim();

    const sig = `${host}:${port}:${secure}:${user}:${pass.length}`;
    if (this.transporter && this.cachedSignature === sig) {
      return this.transporter;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    this.cachedSignature = sig;
    return this.transporter;
  }

  private getFromAddress(): string {
    const custom = (process.env.SMTP_FROM || '').trim();
    if (custom) return custom;
    const user = (process.env.SMTP_USER || '').trim();
    return `FinX TestCase Hub <${user}>`;
  }

  async sendMail(options: {
    to: string | string[];
    subject: string;
    text: string;
    html: string;
  }): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
    const transporter = this.getTransporter();
    if (!transporter) {
      return { sent: false, skipped: true };
    }

    const recipients = (Array.isArray(options.to) ? options.to : [options.to])
      .map((addr) => addr.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      return { sent: false, skipped: true };
    }

    try {
      await transporter.sendMail({
        from: this.getFromAddress(),
        to: recipients.join(', '),
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return { sent: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP send failed (${options.subject}): ${msg}`);
      return { sent: false, error: msg };
    }
  }

  private wrapHtmlLayout(title: string, bodyHtml: string): string {
    const appUrl = escapeHtml(resolveAppUrl());
    return `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <div style="background:#11131a;padding:18px 24px;color:#ffffff;">
      <div style="font-size:16px;font-weight:700;letter-spacing:-0.01em;">FinX TestCase Hub</div>
      <div style="font-size:12px;color:#cbd5e1;margin-top:2px;">${escapeHtml(title)}</div>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
      Truy cập hệ thống: <a href="${appUrl}" style="color:#851fb6;text-decoration:none;">${appUrl}</a>
    </div>
  </div>
</body>
</html>`;
  }

  async sendPasswordResetRequestToAdmins(params: {
    adminEmails: string[];
    requesterEmail: string;
    requesterName: string;
    note?: string;
  }): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
    if (!this.isEnabled() || params.adminEmails.length === 0) {
      return { sent: false, skipped: true };
    }

    const appUrl = resolveAppUrl();
    const usersPageUrl = `${appUrl}/users`;
    const noteLine = params.note?.trim()
      ? `<p style="margin:12px 0;padding:10px 12px;background:#f8fafc;border-left:3px solid #851fb6;border-radius:6px;"><strong>Ghi chú:</strong> ${escapeHtml(params.note.trim())}</p>`
      : '';

    const html = this.wrapHtmlLayout(
      'Yêu cầu đặt lại mật khẩu mới',
      `
        <p style="margin-top:0;">Xin chào Quản trị viên,</p>
        <p>Thành viên <strong>${escapeHtml(params.requesterName)}</strong> (<code>${escapeHtml(params.requesterEmail)}</code>) vừa gửi yêu cầu đặt lại mật khẩu trên FinX TestCase Hub.</p>
        ${noteLine}
        <p style="margin-top:18px;">
          <a href="${escapeHtml(usersPageUrl)}" style="display:inline-block;padding:10px 16px;background:#851fb6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Mở trang Quản lý Thành viên</a>
        </p>
      `,
    );

    const text = [
      'FinX TestCase Hub — Yêu cầu đặt lại mật khẩu mới',
      '',
      `Thành viên: ${params.requesterName} (${params.requesterEmail})`,
      params.note?.trim() ? `Ghi chú: ${params.note.trim()}` : null,
      '',
      `Xử lý tại: ${usersPageUrl}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    return this.sendMail({
      to: params.adminEmails,
      subject: `[FinX TestCase Hub] Yêu cầu đặt lại mật khẩu từ ${params.requesterName}`,
      text,
      html,
    });
  }

  async sendTempPasswordToUser(params: {
    to: string;
    fullName: string;
    tempPassword: string;
    mustChangePassword: boolean;
  }): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return { sent: false, skipped: true };
    }

    const appUrl = resolveAppUrl();
    const loginUrl = `${appUrl}/login`;
    const forceNote = params.mustChangePassword
      ? 'Hệ thống sẽ yêu cầu bạn đổi sang mật khẩu mới ngay sau khi đăng nhập.'
      : 'Bạn nên đổi lại mật khẩu cá nhân sau khi đăng nhập.';

    const html = this.wrapHtmlLayout(
      'Mật khẩu tạm thời đã được cấp',
      `
        <p style="margin-top:0;">Xin chào <strong>${escapeHtml(params.fullName)}</strong>,</p>
        <p>Quản trị viên đã đặt lại mật khẩu cho tài khoản <code>${escapeHtml(params.to)}</code> của bạn.</p>
        <div style="margin:16px 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Mật khẩu tạm thời</div>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:0.04em;">${escapeHtml(params.tempPassword)}</div>
        </div>
        <p style="color:#475569;font-size:13px;">${escapeHtml(forceNote)}</p>
        <p style="margin-top:18px;">
          <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 16px;background:#851fb6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Đăng nhập ngay</a>
        </p>
      `,
    );

    const text = [
      `Xin chào ${params.fullName},`,
      '',
      `Quản trị viên đã đặt lại mật khẩu cho tài khoản ${params.to}.`,
      `Mật khẩu tạm thời: ${params.tempPassword}`,
      forceNote,
      '',
      `Đăng nhập tại: ${loginUrl}`,
    ].join('\n');

    return this.sendMail({
      to: params.to,
      subject: '[FinX TestCase Hub] Mật khẩu tạm thời của bạn',
      text,
      html,
    });
  }

  async sendWelcomeAccountEmail(params: {
    to: string;
    fullName: string;
    initialPassword: string;
    role: string;
    mustChangePassword: boolean;
  }): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return { sent: false, skipped: true };
    }

    const appUrl = resolveAppUrl();
    const loginUrl = `${appUrl}/login`;
    const forceNote = params.mustChangePassword
      ? 'Bạn sẽ được yêu cầu đổi mật khẩu ngay ở lần đăng nhập đầu tiên.'
      : 'Bạn có thể đổi mật khẩu cá nhân sau khi đăng nhập.';

    const html = this.wrapHtmlLayout(
      'Tài khoản mới đã sẵn sàng',
      `
        <p style="margin-top:0;">Xin chào <strong>${escapeHtml(params.fullName)}</strong>,</p>
        <p>Quản trị viên đã tạo tài khoản FinX TestCase Hub cho bạn với vai trò <strong>${escapeHtml(params.role)}</strong>.</p>
        <div style="margin:16px 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-size:13px;margin-bottom:6px;"><strong>Email:</strong> <code>${escapeHtml(params.to)}</code></div>
          <div style="font-size:13px;"><strong>Mật khẩu ban đầu:</strong> <code style="font-weight:700;font-size:15px;">${escapeHtml(params.initialPassword)}</code></div>
        </div>
        <p style="color:#475569;font-size:13px;">${escapeHtml(forceNote)}</p>
        <p style="margin-top:18px;">
          <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 16px;background:#851fb6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Đăng nhập FinX TestCase Hub</a>
        </p>
      `,
    );

    const text = [
      `Xin chào ${params.fullName},`,
      '',
      `Tài khoản FinX TestCase Hub của bạn đã được tạo (Vai trò: ${params.role}).`,
      `Email: ${params.to}`,
      `Mật khẩu ban đầu: ${params.initialPassword}`,
      forceNote,
      '',
      `Đăng nhập tại: ${loginUrl}`,
    ].join('\n');

    return this.sendMail({
      to: params.to,
      subject: '[FinX TestCase Hub] Thông tin tài khoản mới của bạn',
      text,
      html,
    });
  }
}
