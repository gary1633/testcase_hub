import { Module } from '@nestjs/common';
import { TestCasesModule } from '../test-cases/test-cases.module';
import { DefectsModule } from '../defects/defects.module';
import { TestRunsController } from './test-runs.controller';
import { RunEvidenceController } from './run-evidence.controller';
import { TestRunsService } from './test-runs.service';

@Module({
  imports: [TestCasesModule, DefectsModule],
  controllers: [TestRunsController, RunEvidenceController],
  providers: [TestRunsService],
  exports: [TestRunsService],
})
export class TestRunsModule {}
