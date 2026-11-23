import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './db/database.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly dbService: DatabaseService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      dbDriver: this.dbService.driver,
      timestamp: new Date().toISOString(),
    };
  }
}
