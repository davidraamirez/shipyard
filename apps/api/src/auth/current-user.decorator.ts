import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// What JwtStrategy.validate() puts in request.user.
export interface AuthenticatedUser {
  userId: string;
  email: string;
}

// Only use on routes protected by JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    return request.user;
  },
);
