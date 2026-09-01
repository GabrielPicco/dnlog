import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Log de auditoria: registra ações/edições feitas em qualquer tela do DNLog
 * (criar/editar/cancelar/faturar OE, salvar agendamento, mudar status, etc.).
 * Só leitura para o usuário — serve de trilha de auditoria "quem fez o quê e
 * quando". Não tem nada a ver com o SAP (é interno do DNLog).
 */
@Entity('logs')
export class LogEntry {
  @PrimaryGeneratedColumn()
  id: number;

  // CreateDateColumn escolhe o tipo certo por driver (timestamp no pg, datetime
  // no sqlite), então não precisa do truque manual de tipo.
  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column('varchar', { nullable: true })
  usuario: string | null;

  @Column('varchar', { nullable: true })
  tela: string | null;

  @Index()
  @Column('varchar')
  acao: string;

  @Column('varchar', { length: 500, nullable: true })
  detalhe: string | null;

  @Column('varchar', { name: 'entidade_tipo', nullable: true })
  entidadeTipo: string | null;

  @Column('varchar', { name: 'entidade_id', nullable: true })
  entidadeId: string | null;
}
