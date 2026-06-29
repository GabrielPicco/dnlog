import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { SapModule } from './sap/sap.module';
import { ApiModule } from './api/api.module';
import { DatabaseModule } from './database/database.module';
import { OeModule } from './oe/oe.module';
import { AuthModule } from './auth/auth.module';
import { ApiKeyGuard } from './common/api-key.guard';

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
    AuthModule,
    ApiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
