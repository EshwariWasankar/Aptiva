import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/guards/roles.guard';

/**
 * Minimal admin probe used to verify the role guard (SEC-004) until the
 * real admin module lands in PH-2.
 */
@ApiTags('admin')
@Controller('admin')
export class AdminController {
  @Get('ping')
  @Roles('admin')
  ping(): { pong: true } {
    return { pong: true };
  }
}
