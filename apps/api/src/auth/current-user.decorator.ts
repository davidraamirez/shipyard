import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Lo que JwtStrategy.validate() deja en request.user.
export interface AuthenticatedUser {
  userId: string;
  email: string;
}

// Usar solo en rutas protegidas con JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    return request.user;
  },
);
