import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://imarket:local_only_change_me@127.0.0.1:5433/imarket',
    max: 8,
    connectionTimeoutMillis: 2000,
  });
  async onModuleDestroy() { await this.pool.end(); }
}
