import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Guard de autenticação por API key.
 *
 * Exige o header `x-api-key` igual ao valor de API_KEY no .env.
 * - Rotas marcadas com @Public() (ex.: /health) passam sem chave.
 * - Se API_KEY não estiver configurada, o guard libera tudo mas registra
 *   um aviso — útil em desenvolvimento, inaceitável em produção com SAP real.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const expectedKey = this.config.get<string>('API_KEY');
    if (!expectedKey) {
      this.logger.warn(
        'API_KEY não configurada — autenticação DESABILITADA. Configure no .env antes de usar o SAP real.',
      );
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-api-key'];
    if (providedKey !== expectedKey) {
      throw new UnauthorizedException('API key inválida ou ausente.');
    }
    return true;
  }
}
