import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { WorkspaceService } from './workspace.service';

@ApiTags('Workspace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('search')
  async search(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.workspaceService.globalSearch(user, q ?? '');
  }

  @Get('my-work')
  async myWork(@CurrentUser() user: AuthUser) {
    return this.workspaceService.getMyWork(user);
  }
}
