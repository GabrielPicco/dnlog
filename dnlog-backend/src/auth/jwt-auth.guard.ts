import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../common/public.decorator';

/**
 * Guard de sessão JWT. Usado como guard GLOBAL: toda rota exige
 * Authorization: Bearer <token> (emitido no login), EXCETO as marcadas
 * com @Public() (ex.: /health, /auth/google, /auth/dev-login).
 *
 * Antes, a API de dados (pedidos, estoque, OEs...) ficava aberta. Agora só
 * usuários logados (e aprovados) leem dados ou mexem em OEs.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('Sessão ausente — faça login');
    try {
      req.usuario = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }
  }
}

/**
 * Guard que exige perfil GESTOR (admin). Usar junto com o JwtAuthGuard global
 * (que já preenche req.usuario antes deste rodar).
 */
@Injectable()
export class GestorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.usuario?.perfil !== 'GESTOR') {
      throw new ForbiddenException('Apenas gestores podem fazer isso');
    }
    return true;
  }
}

/** Injeta o usuário do token no parâmetro do controller. */
export const UsuarioAtual = createParamDecorator((_data, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().usuario;
});
