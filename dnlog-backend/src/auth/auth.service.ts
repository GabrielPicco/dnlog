import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuth2Client } from 'google-auth-library';
import { Usuario } from './usuario.entity';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private google: OAuth2Client;

  constructor(
    @InjectRepository(Usuario) private readonly repo: Repository<Usuario>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.google = new OAuth2Client(this.clientId);
  }

  private get clientId(): string {
    return this.config.get<string>('GOOGLE_CLIENT_ID') || '';
  }
  private get dominio(): string {
    return (this.config.get<string>('GOOGLE_AUTHORIZED_DOMAIN') || 'dnseeds.com.br').toLowerCase();
  }
  private get adminEmail(): string {
    return (this.config.get<string>('ADMIN_EMAIL') || 'gabriel@dnseeds.com.br').toLowerCase();
  }
  private get bypass(): boolean {
    return this.config.get<string>('AUTH_BYPASS') === 'true';
  }

  /** Garante que o admin (Gabriel) já exista como GESTOR aprovado. */
  async onModuleInit() {
    const email = this.adminEmail;
    let u = await this.repo.findOne({ where: { email } });
    if (!u) {
      u = this.repo.create({
        email,
        nome: 'Gabriel (Admin)',
        perfil: 'GESTOR',
        status: 'APROVADO',
        aprovadoPor: 'sistema',
        aprovadoEm: new Date(),
      });
      await this.repo.save(u);
      this.logger.log(`Admin inicial criado: ${email} (GESTOR/APROVADO)`);
    }
  }

  /**
   * Login via Google: valida o ID token, confere o domínio @dnseeds.com.br,
   * cria/atualiza o usuário e devolve um token de sessão (JWT) + dados do user.
   */
  async loginGoogle(credential: string) {
    if (!credential) throw new UnauthorizedException('Token Google ausente');
    let payload: any;
    try {
      const ticket = await this.google.verifyIdToken({ idToken: credential, audience: this.clientId });
      payload = ticket.getPayload();
    } catch (e) {
      this.logger.warn(`Falha ao validar token Google: ${e.message}`);
      throw new UnauthorizedException('Login Google inválido');
    }
    return this.entrar(payload.email, payload.name, payload.picture, payload.hd);
  }

  /**
   * Login de desenvolvimento (sem Google) — só funciona com AUTH_BYPASS=true.
   * Permite testar o fluxo de aprovação antes de configurar o Google.
   */
  async loginDev(email: string, nome?: string) {
    if (!this.bypass) throw new ForbiddenException('Login DEV desabilitado (AUTH_BYPASS != true)');
    return this.entrar(email, nome || email, null, undefined);
  }

  /** Núcleo do login: valida domínio, faz upsert do usuário e emite o JWT. */
  private async entrar(emailRaw: string, nome: string, foto: string | null, hd?: string) {
    const email = (emailRaw || '').toLowerCase().trim();
    if (!email) throw new UnauthorizedException('E-mail ausente');
    // Restringe ao domínio corporativo (hd do Google ou sufixo do e-mail).
    const dominioOk = email.endsWith('@' + this.dominio) || (hd && hd.toLowerCase() === this.dominio);
    if (!dominioOk) {
      throw new ForbiddenException(`Apenas contas @${this.dominio} podem acessar`);
    }

    let u = await this.repo.findOne({ where: { email } });
    if (!u) {
      const ehAdmin = email === this.adminEmail;
      u = this.repo.create({
        email,
        nome,
        foto,
        perfil: ehAdmin ? 'GESTOR' : 'OPERADOR',
        status: ehAdmin ? 'APROVADO' : 'PENDENTE',
        aprovadoPor: ehAdmin ? 'sistema' : null,
        aprovadoEm: ehAdmin ? new Date() : null,
      });
    } else {
      // Atualiza dados de perfil do Google a cada login
      if (nome) u.nome = nome;
      if (foto) u.foto = foto;
    }
    u.ultimoLogin = new Date();
    await this.repo.save(u);

    const token = await this.jwt.signAsync({ sub: u.id, email: u.email, perfil: u.perfil, status: u.status });
    return { token, usuario: this.publico(u) };
  }

  /** Dados do usuário a partir do token (rota /auth/me). */
  async me(userId: string) {
    const u = await this.repo.findOne({ where: { id: userId } });
    if (!u) throw new UnauthorizedException('Usuário não encontrado');
    return this.publico(u);
  }

  // ---------- Administração de usuários (gestor) ----------

  async listar() {
    const us = await this.repo.find({ order: { createdAt: 'DESC' } });
    return us.map((u) => this.publico(u));
  }

  async definirStatus(id: string, status: string, perfil: string | undefined, adminEmail: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new UnauthorizedException('Usuário não encontrado');
    if (u.email === this.adminEmail) {
      throw new ForbiddenException('O admin não pode ser alterado');
    }
    if (status) u.status = status;
    if (perfil) u.perfil = perfil;
    if (status === 'APROVADO') {
      u.aprovadoPor = adminEmail;
      u.aprovadoEm = new Date();
    }
    await this.repo.save(u);
    this.logger.log(`Usuário ${u.email} -> status=${u.status} perfil=${u.perfil} (por ${adminEmail})`);
    return this.publico(u);
  }

  private publico(u: Usuario) {
    return {
      id: u.id,
      email: u.email,
      nome: u.nome,
      foto: u.foto,
      perfil: u.perfil,
      status: u.status,
      aprovado_por: u.aprovadoPor,
      aprovado_em: u.aprovadoEm,
      ultimo_login: u.ultimoLogin,
      created_at: u.createdAt,
    };
  }
}
