import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Cadastro de motoristas/veículos usados nas Ordens de Embarque. Ao salvar uma
 * OE, os dados do motorista+caminhão são gravados aqui (upsert por CPF) para
 * ficarem disponíveis num seletor na próxima OE. Nada a ver com o SAP.
 */
@Entity('motoristas')
export class Motorista {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  nome: string;

  @Index()
  @Column({ nullable: true })
  cpf: string;

  @Column({ nullable: true })
  cnh: string;

  @Column({ nullable: true })
  telefone: string;

  @Column({ nullable: true })
  placa: string;

  @Column({ name: 'placa_uf', nullable: true })
  placaUf: string;

  @Column({ name: 'veiculo_tipo', nullable: true })
  veiculoTipo: string;

  @Column({ nullable: true })
  reboque: string;

  @Column({ name: 'transportadora_nome', nullable: true })
  transportadoraNome: string;

  @Column({ name: 'transportadora_cnpj', nullable: true })
  transportadoraCnpj: string;

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
