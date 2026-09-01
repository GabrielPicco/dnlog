import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './usuario.entity';
import { AuthService } from './auth.service';
import { AuthController, UsuariosController } from './auth.controller';
import { JwtAuthGuard, GestorGuard } from './jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dnlog-dev-secret-trocar',
        // Sessão longa: evita expirar no meio do uso (com o app aberto por horas)
        // e o consequente loop de "sessão expirada" ao salvar. Configurável por env.
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '30d' },
      }),
    }),
  ],
  controllers: [AuthController, UsuariosController],
  providers: [AuthService, JwtAuthGuard, GestorGuard],
  exports: [AuthService],
})
export class AuthModule {}
