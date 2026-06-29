import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // CORS: respeita a origem configurada no .env (CORS_ORIGIN).
  // Use '*' apenas em desenvolvimento; em produção, informe o domínio do DNLog.
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  app.setGlobalPrefix('api');

  // Permite encerrar a sessão do SAP (Logout) ao desligar o backend.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const mode = process.env.USE_MOCK === 'true' ? 'MOCK (SAP simulado)' : 'SAP REAL';
  logger.log('============================================================');
  logger.log(`DNLog Backend rodando na porta ${port}`);
  logger.log(`Modo: ${mode}`);
  logger.log(`API disponivel em: http://localhost:${port}/api`);
  logger.log(`Health check:      http://localhost:${port}/api/health`);
  logger.log('============================================================');
}

bootstrap();
