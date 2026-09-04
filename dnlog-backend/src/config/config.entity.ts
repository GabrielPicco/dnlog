import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Configuração GLOBAL do DNLog (linha única, id = 1). Guarda preferências que
 * valem para todos — ex.: quais itens do menu lateral ficam ocultos.
 * Nada a ver com o SAP; é interno do app.
 */
@Entity('config')
export class Config {
  @PrimaryColumn('int')
  id: number; // sempre 1 (singleton)

  @Column('simple-json', { nullable: true })
  dados: any;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
