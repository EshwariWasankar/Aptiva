import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/guards/auth.guard';
import { parseBody } from '../common/http/zod';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateMeDtoSchema } from '../auth/dto';

/** E-007: profile read/update for the authenticated user. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getMe(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { profile: true },
    });
    return {
      user: {
        id: record.id,
        email: record.email,
        role: record.role,
        emailVerified: record.emailVerifiedAt !== null,
      },
      profile: record.profile
        ? {
            gradYear: record.profile.gradYear,
            branch: record.profile.branch,
            college: record.profile.college,
            language: record.profile.language,
          }
        : null,
    };
  }

  @Put()
  async updateMe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const dto = parseBody(UpdateMeDtoSchema, body);
    await this.prisma.studentProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        gradYear: dto.gradYear ?? null,
        branch: dto.branch ?? null,
        college: dto.college ?? null,
        ...(dto.language !== undefined ? { language: dto.language } : {}),
      },
      update: {
        ...(dto.gradYear !== undefined ? { gradYear: dto.gradYear } : {}),
        ...(dto.branch !== undefined ? { branch: dto.branch } : {}),
        ...(dto.college !== undefined ? { college: dto.college } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
      },
    });
    return this.getMe(user);
  }
}
