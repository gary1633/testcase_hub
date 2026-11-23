import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { projectMembers, projects } from '../db/schema';
import type { AuthUser } from './auth-user.interface';
import {
  canEditCases,
  canManageProject,
  canViewAllProjects,
  type ProjectRole,
  type UserRole,
} from '@tcms/shared';

export interface ProjectAccessResult {
  project: typeof projects.$inferSelect;
  effectiveRole: UserRole | ProjectRole;
}

@Injectable()
export class ProjectAccessService {
  constructor(private readonly dbService: DatabaseService) {}

  async verifyAccess(
    projectId: string,
    user: AuthUser,
    requirement: 'view' | 'edit' | 'manage' = 'view',
  ): Promise<ProjectAccessResult> {
    const [project] = await this.dbService.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    let effectiveRole: UserRole | ProjectRole | null = null;
    if (canViewAllProjects(user.role)) {
      effectiveRole = user.role;
    } else {
      const [membership] = await this.dbService.db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (membership) {
        effectiveRole = user.role;
      }
    }

    if (!effectiveRole) {
      throw new ForbiddenException('Bạn không có quyền truy cập dự án này');
    }

    if (requirement === 'edit' && !canEditCases(effectiveRole)) {
      throw new ForbiddenException('Vai trò PM chỉ có quyền xem, không thể chỉnh sửa test case');
    }

    if (requirement === 'manage' && !canManageProject(effectiveRole)) {
      throw new ForbiddenException('Chỉ Admin, QA Manager hoặc QA Lead mới có quyền quản lý dự án');
    }

    return { project, effectiveRole };
  }
}
