import { Module } from '@nestjs/common';
import { CiController } from './ci.controller';
import { CiService } from './ci.service';

@Module({
  controllers: [CiController],
  providers: [CiService],
  exports: [CiService],
})
export class CiModule {}
