import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { TestCasesService } from './test-cases.service';
import { SharedStepsService } from './shared-steps.service';
import { TestCasesController } from './test-cases.controller';
import { AttachmentsController } from './attachments.controller';
import { ProjectHistoryController } from './project-history.controller';
import { SharedStepsController } from './shared-steps.controller';

@Module({
  controllers: [
    TestCasesController,
    AttachmentsController,
    ProjectHistoryController,
    SharedStepsController,
  ],
  providers: [StorageService, TestCasesService, SharedStepsService],
  exports: [StorageService, TestCasesService, SharedStepsService],
})
export class TestCasesModule {}
