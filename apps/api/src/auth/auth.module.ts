import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET?.trim();
        const isPlaceholder =
          !secret ||
          secret === 'tcms-local-dev-secret-change-me' ||
          /change[_-]?me|change[_-]?this/i.test(secret);
        if (process.env.NODE_ENV === 'production' && (isPlaceholder || secret.length < 32)) {
          throw new Error(
            'JWT_SECRET must be set to a strong non-placeholder secret (>= 32 chars) in production!',
          );
        }
        return {
          secret: secret || 'tcms-local-dev-secret-change-me',
          signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, AuthService],
})
export class AuthModule {}
