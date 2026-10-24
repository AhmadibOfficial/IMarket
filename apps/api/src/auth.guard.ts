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
    request.res?.setHeader('Cache-Control','no-store');
    request.principal=await this.auth.authenticate(request.headers.authorization);
    if (controller === 'ProtectionController') {
      const roles: Record<string,string[]> = {overview:['merchant'],edit:['merchant'],orderDetail:['buyer','merchant'],application:['merchant'],apply:['merchant'],reviews:['admin'],reviewMerchant:['admin'],submit:['merchant'],reviewProduct:['admin'],stock:['merchant'],disputes:['buyer','merchant','admin'],open:['buyer'],respond:['merchant'],resolve:['admin'],audits:['admin']};
      if (!roles[handler]?.includes(request.principal.role)||(request.principal.role==='merchant'&&!request.principal.merchant_id)) throw new ForbiddenException();
      await this.auth.limit(`mutation:${request.principal.id}`,120);
      return true;
    }
    const roles: Record<string,string>={create:'merchant',join:'buyer',groupCheckout:'buyer',checkout:'buyer',cartCheckout:'buyer',cancelGroup:'merchant',expireGroup:'merchant',cancelOrder:'buyer',merchantProducts:'merchant',createProduct:'merchant',publishProduct:'merchant',fulfill:'merchant'};
    const role=controller === 'ApiController' ? roles[handler] : undefined;
    if(controller === 'ApiController' && handler === 'orders') {
      if(!['buyer','merchant'].includes(request.principal.role)) throw new ForbiddenException();
      return true;
    }
    if (role) this.auth.requireRole(request.principal,role as 'merchant'|'buyer');
    else if (!(controller === 'AuthController' && handler === 'logout')) throw new ForbiddenException();
    await this.auth.limit(`mutation:${request.principal.id}`,120);
    return true;
  }
}
