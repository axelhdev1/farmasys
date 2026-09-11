import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../auth.types';

/**
 * Inyecta el usuario autenticado (payload del JWT) en el handler.
 * Ej.: metodo(@CurrentUser() user: JwtPayload) { ... }
 * También permite extraer una sola propiedad: @CurrentUser('sub') id: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
