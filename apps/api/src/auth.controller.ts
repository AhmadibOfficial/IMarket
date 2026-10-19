import { Body, Controller, Header, Headers, Inject, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('login')
  @Header('Cache-Control','no-store')
  login(@Body() input: unknown, @Req() request: {ip: string}) { return this.auth.login(input,request.ip); }
  @Post('logout')
  logout(@Headers('authorization') header: string) { return this.auth.logout(header); }
}
