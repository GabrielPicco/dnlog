import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/public.decorator';
import { JwtAuthGuard, GestorGuard, UsuarioAtual } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Login via Google (recebe o credential/ID token do botão do Google). */
  @Public()
  @Post('google')
  google(@Body() body: any) {
    return this.auth.loginGoogle(body?.credential);
  }

  /** Login de desenvolvimento (só com AUTH_BYPASS=true). */
  @Public()
  @Post('dev-login')
  devLogin(@Body() body: any) {
    return this.auth.loginDev(body?.email, body?.nome);
  }

  /** Dados do usuário logado (precisa do token). */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@UsuarioAtual() u: any) {
    return this.auth.me(u.sub);
  }
}

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly auth: AuthService) {}

  /** Lista todos os usuários (somente gestor). */
  @UseGuards(JwtAuthGuard, GestorGuard)
  @Get()
  listar() {
    return this.auth.listar();
  }

  /**
   * Atualiza status/perfil de um usuário (aprovar, rejeitar, mudar perfil).
   * body: { status?: 'APROVADO'|'REJEITADO'|'PENDENTE', perfil?: 'OPERADOR'|'CONFERENTE'|'GESTOR' }
   */
  @UseGuards(JwtAuthGuard, GestorGuard)
  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: any, @UsuarioAtual() u: any) {
    return this.auth.definirStatus(id, body?.status, body?.perfil, u.email);
  }
}
