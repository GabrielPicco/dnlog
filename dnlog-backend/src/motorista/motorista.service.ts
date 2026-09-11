import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Motorista } from './motorista.entity';

@Injectable()
export class MotoristaService {
  constructor(
    @InjectRepository(Motorista)
    private readonly repo: Repository<Motorista>,
  ) {}

  /** Lista todos os motoristas cadastrados, em ordem alfabética. */
  listar(): Promise<Motorista[]> {
    return this.repo.find({ order: { nome: 'ASC' } });
  }

  /**
   * Grava (upsert) um motorista. Casa por CPF (preferido) ou, na falta dele,
   * por nome+placa. Ignora se não vier nem nome nem CPF (nada útil para salvar).
   */
  async salvar(dto: any): Promise<Motorista | null> {
    const nome = (dto?.nome || '').trim();
    const cpf = (dto?.cpf || '').trim();
    if (!nome && !cpf) return null;

    const placa = (dto?.placa || '').trim().toUpperCase();
    const dados = {
      nome,
      cpf,
      cnh: (dto?.cnh || '').trim(),
      telefone: (dto?.telefone || '').trim(),
      placa,
      placaUf: (dto?.placaUf || dto?.placa_uf || '').trim().toUpperCase(),
      veiculoTipo: (dto?.veiculoTipo || dto?.veiculo_tipo || '').trim(),
      reboque: (dto?.reboque || '').trim().toUpperCase(),
      transportadoraNome: (dto?.transportadoraNome || dto?.transportadora_nome || '').trim(),
      transportadoraCnpj: (dto?.transportadoraCnpj || dto?.transportadora_cnpj || '').trim(),
    };

    let existente: Motorista | null = null;
    if (cpf) existente = await this.repo.findOne({ where: { cpf } });
    if (!existente && nome) existente = await this.repo.findOne({ where: { nome, placa } });

    if (existente) {
      await this.repo.update(existente.id, dados);
      return { ...existente, ...dados } as Motorista;
    }
    return this.repo.save(this.repo.create(dados));
  }

  async remover(id: string): Promise<{ ok: boolean }> {
    await this.repo.delete(id);
    return { ok: true };
  }
}
