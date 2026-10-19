import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Deliberate hard stop: local synthetic authentication only; real identity and payments remain gated.
  if (process.env.NODE_ENV === 'production') throw new Error('IMarket demo API refuses production startup.');
  if (process.env.APP_DEMO_MODE !== 'true') throw new Error('APP_DEMO_MODE=true required for demo API.');
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.enableCors({origin:['http://localhost:3000','http://127.0.0.1:3000'],methods:['GET','POST']});
  const port = Number(process.env.PORT || 4000);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PORT');
  await app.listen(port, '127.0.0.1');
  console.log(`IMarket LOCAL DEMO ONLY (no payments, synthetic accounts only) on http://127.0.0.1:${port}`);
}
bootstrap().catch(err => { console.error(err.message); process.exit(1); });
