import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { SapModule } from './sap/sap.module';
import { ApiModule } from './api/api.module';
import { DatabaseModule } from './database/database.module';
import { OeModule } from './oe/oe.module';
import { AgendamentoModule } from './agendamento/agendamento.module';
import { LogModule } from './log/log.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Serve o app (dnlog-app.html como index.html) em http://localhost:3000/
    // — necessário para o login Google funcionar (não roda em file://).
    // Coloque o HTML em dnlog-backend/public/index.html (ou ajuste DNLOG_PUBLIC_DIR).
    ServeStaticModule.forRoot({
      rootPath: process.env.DNLOG_PUBLIC_DIR
        ? join(process.cwd(), process.env.DNLOG_PUBLIC_DIR)
        : join(process.cwd(), 'public'),
      exclude: ['/api*'],
    }),
    DatabaseModule,
    SapModule,
    OeModule,
    AgendamentoModule,
    LogModule,
    AuthModule,
    ApiModule,
  ],
  providers: [
    // Guard GLOBAL de autenticação: toda rota exige login (JWT), exceto as
    // marcadas com @Public() (health, auth/google, auth/dev-login).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
