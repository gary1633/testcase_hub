import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { passwordResetRequests, users } from '../db/schema';
import { MailService } from '../mail/mail.service';
import type { UserDto, UserRole } from '@tcms/shared';

export function getGoogleClientId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env.GOOGLE_CLIENT_ID || '').trim();
  return id || null;
}

export function isGoogleAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(getGoogleClientId(env));
}

export function isGoogleEmailAllowed(email: string, allowedDomainsRaw?: string): boolean {
  const normalized = email.trim().toLowerCase();
  const atIdx = normalized.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === normalized.length - 1) return false;

  const domain = normalized.slice(atIdx + 1);
  const raw = (allowedDomainsRaw || '').trim();
  if (!raw) return true;

  const allowed = raw
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

  if (allowed.length === 0) return true;
  return allowed.includes(domain);
}

export function resolveGoogleDefaultRole(raw?: string): 'QA' | 'PM' | 'PO' {
  const normalized = (raw || '').trim().toUpperCase();
  if (normalized === 'PM') return 'PM';
  if (normalized === 'PO') return 'PO';
  return 'QA';
}

interface GoogleTokenInfo {
  aud?: string;
  iss?: string;
  exp?: string | number;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private toUserDto(user: typeof users.$inferSelect): UserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as UserRole,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async login(email: string, password: string): Promise<{ accessToken: string; user: UserDto }> {
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: this.toUserDto(user),
    };
  }

  async loginWithGoogle(idToken: string): Promise<{ accessToken: string; user: UserDto }> {
    const clientId = getGoogleClientId(process.env);
    if (!clientId) {
      throw new BadRequestException('Đăng nhập bằng Google chưa được kích hoạt trên hệ thống này.');
    }

    let tokenInfo: GoogleTokenInfo;
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) {
        throw new UnauthorizedException('Phiên xác thực Google không hợp lệ hoặc đã hết hạn.');
      }
      tokenInfo = (await res.json()) as GoogleTokenInfo;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(
        `Google tokeninfo verification error: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException('Không thể xác thực với Google. Vui lòng thử lại sau.');
    }

    const validIssuer =
      tokenInfo.iss === 'https://accounts.google.com' || tokenInfo.iss === 'accounts.google.com';
    const emailVerified =
      tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
    const expSec = Number(tokenInfo.exp || 0);
    const notExpired = Number.isFinite(expSec) && expSec * 1000 > Date.now();

    if (tokenInfo.aud !== clientId || !validIssuer || !emailVerified || !notExpired || !tokenInfo.email) {
      throw new UnauthorizedException('Token đăng nhập Google không hợp lệ.');
    }

    const normalizedEmail = tokenInfo.email.trim().toLowerCase();
    if (!isGoogleEmailAllowed(normalizedEmail, process.env.GOOGLE_ALLOWED_DOMAINS)) {
      throw new UnauthorizedException(
        'Email Google này không thuộc tên miền công ty được phép truy cập.',
      );
    }

    let [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (user && !user.isActive) {
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên.');
    }

    if (!user) {
      const autoProvision =
        (process.env.GOOGLE_AUTO_PROVISION || '').trim().toLowerCase() === 'true';
      if (!autoProvision) {
        throw new UnauthorizedException(
          'Email Google này chưa được Quản trị viên cấp tài khoản trên hệ thống.',
        );
      }

      const fallbackName = normalizedEmail.split('@')[0] || 'User';
      const fullName = (tokenInfo.name || '').trim().slice(0, 120) || fallbackName;
      const randomPassword = randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      const role = resolveGoogleDefaultRole(process.env.GOOGLE_DEFAULT_ROLE);

      const [created] = await this.dbService.db
        .insert(users)
        .values({
          email: normalizedEmail,
          fullName,
          passwordHash,
          role,
          isActive: true,
          mustChangePassword: false,
        })
        .returning();
      user = created;
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: this.toUserDto(user),
    };
  }

  async getMe(userId: string): Promise<UserDto> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.toUserDto(user);
  }

  async updateProfile(
    userId: string,
    input: { fullName?: string; email?: string },
  ): Promise<UserDto> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa');
    }

    const updateData: Partial<typeof users.$inferInsert> = {};

    if (input.fullName !== undefined) {
      const trimmed = input.fullName.trim();
      if (trimmed.length < 2) {
        throw new BadRequestException('Họ tên tối thiểu 2 ký tự');
      }
      updateData.fullName = trimmed;
    }

    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        const [duplicate] = await this.dbService.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, normalizedEmail), ne(users.id, userId)))
          .limit(1);

        if (duplicate) {
          throw new ConflictException('Email này đã được sử dụng bởi tài khoản khác');
        }
        updateData.email = normalizedEmail;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return this.toUserDto(user);
    }

    const [updated] = await this.dbService.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    return this.toUserDto(updated);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserDto> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [updated] = await this.dbService.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
      })
      .where(eq(users.id, userId))
      .returning();

    return this.toUserDto(updated);
  }

  async requestPasswordReset(
    email: string,
    note?: string,
  ): Promise<{ ok: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanNote = (note || '').trim().slice(0, 300);

    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (user && user.isActive) {
      const [existingPending] = await this.dbService.db
        .select()
        .from(passwordResetRequests)
        .where(
          and(
            eq(passwordResetRequests.userId, user.id),
            eq(passwordResetRequests.status, 'PENDING'),
          ),
        )
        .limit(1);

      if (existingPending) {
        await this.dbService.db
          .update(passwordResetRequests)
          .set({
            note: cleanNote || existingPending.note,
            createdAt: new Date(),
          })
          .where(eq(passwordResetRequests.id, existingPending.id));
      } else {
        await this.dbService.db.insert(passwordResetRequests).values({
          userId: user.id,
          email: user.email,
          note: cleanNote,
          status: 'PENDING',
        });
      }

      if (this.mailService.isEnabled()) {
        void this.dbService.db
          .select({ email: users.email })
          .from(users)
          .where(
            and(
              inArray(users.role, ['ADMIN', 'QA_MANAGER']),
              eq(users.isActive, true),
            ),
          )
          .then((admins) =>
            this.mailService.sendPasswordResetRequestToAdmins({
              adminEmails: admins.map((a) => a.email),
              requesterEmail: user.email,
              requesterName: user.fullName,
              note: cleanNote,
            }),
          )
          .catch((err) => {
            this.logger.warn(
              `Failed to dispatch forgot-password email to admins: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }
    }

    return {
      ok: true,
      message:
        'Nếu email tồn tại và đang hoạt động trong hệ thống, yêu cầu đặt lại mật khẩu đã được gửi tới Quản trị viên (Admin).',
    };
  }
}
