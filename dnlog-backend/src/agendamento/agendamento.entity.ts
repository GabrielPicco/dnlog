import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

// Tipo numérico portável entre SQLite (dev) e PostgreSQL (prod). O PostgreSQL
// não aceita o alias 'float' cru do TypeORM em algumas versões — usamos
// 'double precision'. Mesmo padrão do DATETIME em usuario.entity.ts.
const DECIMAL =
  (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'postgres'
    ? 'double precision'
    : 'float';

/**
 * Agendamento de Embarque (retirada avulsa em fornecedor).
 *
 * É o "documento de agendamento" que o Gabriel envia ao fornecedor (motorista,
 * veículo, transportadora, produtos), agora persistido no banco para dar
 * controle: quais cargas já foram recebidas e quanto se pagou de frete.
 *
 * Padrão híbrido igual à OE: o registro inteiro no formato do frontend fica na
 * coluna JSON `dados`; alguns campos são espelhados em colunas próprias
 * (num, fornecedor, data, recebida, valor_frete) para filtro/relatório via SQL.
 */
@Entity('agendamentos')
export class Agendamento {
  /** Mesmo id usado pelo app (string). Gerado no frontend ou no backend. */
  @PrimaryColumn('varchar')
  id: string;

  /** Número sequencial do agendamento (1, 2, 3...). Único. */
  @Index({ unique: true })
  @Column('int')
  num: number;

  @Column('varchar', { nullable: true })
  fornecedor: string | null;

  /** Data prevista do embarque (YYYY-MM-DD). */
  @Index()
  @Column('varchar', { nullable: true })
  data: string | null;

  // ----- Controle do Gabriel -----
  /** A carga já foi recebida? */
  @Index()
  @Column('boolean', { default: false })
  recebida: boolean;

  /** Valor pago no frete (R$). */
  @Column(DECIMAL, { name: 'valor_frete', nullable: true })
  valorFrete: number | null;

  /** O agendamento completo no formato do frontend (campos + produtos). */
  @Column('simple-json')
  dados: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
