import { Module } from '@nestjs/common';
import { TestCasesModule } from '../test-cases/test-cases.module';
import { DefectsController } from './defects.controller';
import { DefectEvidenceController } from './defect-evidence.controller';
import { DefectsService } from './defects.service';

@Module({
  imports: [TestCasesModule],
  controllers: [DefectsController, DefectEvidenceController],
  providers: [DefectsService],
  exports: [DefectsService],
})
export class DefectsModule {}
