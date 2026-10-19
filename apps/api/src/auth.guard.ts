import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request=context.switchToHttp().getRequest();
    const handler=context.getHandler().name;
    const controller=context.getClass().name;
    if (controller === 'ApiController' && request.method === 'GET' && ['health','products','groups'].includes(handler)) return true;
    if (controller === 'AuthController' && handler === 'login' && request.method === 'POST') return true;
    request.principal=await this.auth.authenticate(request.headers.authorization);
    const role=controller === 'ApiController' ? ({create:'merchant',join:'buyer',checkout:'buyer'} as const)[handler as 'create'|'join'|'checkout'] : undefined;
    if (role) this.auth.requireRole(request.principal,role);
    else if (!(controller === 'AuthController' && handler === 'logout')) throw new ForbiddenException();
    await this.auth.limit(`mutation:${request.principal.id}`,120);
    return true;
  }
}
