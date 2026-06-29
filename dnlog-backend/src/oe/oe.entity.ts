import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Ordem de Embarque (OE) persistida no banco.
 *
 * Estrategia hibrida: a OE inteira (com paradas, itens, lotes, mapa de carga)
 * fica numa coluna JSON `dados`, exatamente no formato que o frontend ja usa —
 * assim o app nao precisa mudar a forma dos dados. Em paralelo, alguns campos
 * sao "espelhados" em colunas proprias (numero, status, cliente, datas...) para
 * permitir filtros, ordenacao e relatorios via SQL sem ter que abrir o JSON.
 *
 * O tipo de coluna 'simple-json' funciona igual em SQLite e PostgreSQL
 * (serializa para texto), mantendo o codigo portavel entre dev e producao.
 */
@Entity('ordens_embarque')
export class Oe {
  /** Mesmo id usado pelo app (string). Gerado no frontend ou no backend. */
  @PrimaryColumn('varchar')
  id: string;

  /** Numero da OE, ex.: "OE-0001". Unico. */
  @Index({ unique: true })
  @Column('varchar')
  numero: string;

  @Index()
  @Column('varchar', { default: 'RASCUNHO' })
  status: string;

  @Column('varchar', { nullable: true })
  modalidade: string | null;

  @Index()
  @Column('varchar', { name: 'data_prevista', nullable: true })
  dataPrevista: string | null;

  @Column('varchar', { nullable: true })
  cliente: string | null;

  @Column('varchar', { name: 'motorista_nome', nullable: true })
  motoristaNome: string | null;

  @Column('varchar', { name: 'veiculo_placa', nullable: true })
  veiculoPlaca: string | null;

  // ----- Vinculo com o SAP -----
  @Index()
  @Column('boolean', { default: false })
  faturada: boolean;

  @Column('varchar', { name: 'nf_numero', nullable: true })
  nfNumero: string | null;

  /**
   * Documentos criados no SAP a partir desta OE (Delivery Notes / Purchase
   * Orders). Ex.: [{ tipo:'DeliveryNote', cliente_codigo, sap_doc_entry,
   * sap_doc_num }]. Preenchido pelo endpoint de faturamento.
   */
  @Column('simple-json', { name: 'sap_docs', nullable: true })
  sapDocs: any[] | null;

  /** A OE completa no formato do frontend (fonte da verdade do conteudo). */
  @Column('simple-json')
  dados: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
