import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column('datetime', { name: 'aprovado_em', nullable: true })
  aprovadoEm: Date | null;

  @Column('datetime', { name: 'ultimo_login', nullable: true })
  ultimoLogin: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
