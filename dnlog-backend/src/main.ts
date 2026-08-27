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

  // ---- Mantém o serviço ACORDADO no plano free do Render ----
  // O free hiberna após ~15 min sem tráfego (aí o 1º acesso vê a tela de
  // "waking up"). Um auto-ping na PRÓPRIA URL pública a cada 10 min gera
  // tráfego que reseta o timer de hibernação, evitando essa tela.
  // Só roda no Render (RENDER_EXTERNAL_URL é setado por lá), nunca localmente.
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (selfUrl) {
    const ping = () =>
      fetch(`${selfUrl}/api/health`)
        .then(() => logger.log('keep-warm: ping OK'))
        .catch((e) => logger.warn('keep-warm: ping falhou — ' + e.message));
    setInterval(ping, 10 * 60 * 1000); // 10 min < 15 min de ociosidade
    setTimeout(ping, 30 * 1000); // primeiro ping logo após subir
    logger.log(`keep-warm ativo (auto-ping a cada 10 min em ${selfUrl})`);
  }
}

bootstrap();
