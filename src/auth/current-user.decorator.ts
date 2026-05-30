import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './jwt-payload';

/** Extrae el usuario autenticado (puesto por JwtStrategy) en los controllers. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
