import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.guard';

export const ROLES_KEY = 'aptiva:roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Role guard (SEC-004): denies when @Roles(...) metadata doesn't include req.user.role. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user && required.includes(req.user.role)) return true;
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Insufficient role',
    });
  }
}
