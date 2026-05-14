import { Controller, Get, Query } from '@nestjs/common';
import { BuilderService } from './builder.service';

@Controller('builder')
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  @Get('schema')
  async getSchema(@Query('site_id') siteId?: string) {
    return this.builderService.getSchema(siteId || 'quirkyhome');
  }
}
