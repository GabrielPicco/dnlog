import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Guard de sessão JWT: exige o header Authorization: Bearer <token> emitido
 * no login. Usado nas rotas de administração de usuários.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('Sessão ausente');
    try {
      req.usuario = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }
  }
}

/**
 * Guard que exige perfil GESTOR (admin). Usar junto com JwtAuthGuard.
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
