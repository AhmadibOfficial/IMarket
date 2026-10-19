import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { DbService } from './db.service';
@Module({ controllers: [ApiController, AuthController], providers: [DbService, AuthService, {provide: APP_GUARD, useClass: AuthGuard}] })
export class AppModule {}
