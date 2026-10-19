import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { DbService } from './db.service';
@Module({ controllers: [ApiController], providers: [DbService] })
export class AppModule {}
