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
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dnlog-dev-secret-trocar',
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController, UsuariosController],
  providers: [AuthService, JwtAuthGuard, GestorGuard],
  exports: [AuthService],
})
export class AuthModule {}
