import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// O Postgres não tem o tipo 'datetime' (usa 'timestamp'); o SQLite usa 'datetime'.
// Em produção o Render define DB_TYPE como variável de ambiente do SO (já
// disponível no import). No dev local (SQLite) cai no padrão 'datetime'.
const DATETIME =
  (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'postgres'
    ? 'timestamp'
    : 'datetime';

/**
 * Usuário do DNLog. O login é via conta Google @dnseeds.com.br — não há senha
 * armazenada aqui (o Google autentica). Guardamos quem é, o perfil e se já foi
 * aprovado para usar o sistema.
 *
 * status:
 *  - PENDENTE: cadastrou via Google mas ainda não foi liberado por um gestor
 *  - APROVADO: pode usar o app
 *  - REJEITADO: acesso negado
 */
@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('varchar')
  email: string;

  @Column('varchar', { nullable: true })
  nome: string | null;

  @Column('varchar', { nullable: true })
  foto: string | null;

  /** OPERADOR | CONFERENTE | GESTOR */
  @Column('varchar', { default: 'OPERADOR' })
  perfil: string;

  /** PENDENTE | APROVADO | REJEITADO */
  @Index()
  @Column('varchar', { default: 'PENDENTE' })
  status: string;

  @Column('varchar', { name: 'aprovado_por', nullable: true })
  aprovadoPor: string | null;

  @Column(DATETIME, { name: 'aprovado_em', nullable: true })
  aprovadoEm: Date | null;

  @Column(DATETIME, { name: 'ultimo_login', nullable: true })
  ultimoLogin: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
