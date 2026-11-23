import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { MailModule } from './mail/mail.module';
import { JiraModule } from './jira/jira.module';
import { WebhookModule } from './webhook/webhook.module';
import { CiModule } from './ci/ci.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { SuitesModule } from './suites/suites.module';
import { TestCasesModule } from './test-cases/test-cases.module';
import { TestPlansModule } from './test-plans/test-plans.module';
import { DefectsModule } from './defects/defects.module';
import { TestRunsModule } from './test-runs/test-runs.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CommonModule,
    MailModule,
    JiraModule,
    WebhookModule,
    UsersModule,
    ProjectsModule,
    SuitesModule,
    TestCasesModule,
    TestPlansModule,
    DefectsModule,
    TestRunsModule,
    CiModule,
    WorkspaceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
