import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Config } from './config.entity';

@Injectable()
export class ConfigAppService {
  constructor(
    @InjectRepository(Config)
    private readonly repo: Repository<Config>,
  ) {}

  /** Devolve os dados da config global (ou {} se ainda não existe). */
  async get(): Promise<any> {
    const r = await this.repo.findOne({ where: { id: 1 } });
    return (r && r.dados) || {};
  }

  /** Salva (substitui) a config global. */
  async save(dados: any): Promise<any> {
    const reg = this.repo.create({ id: 1, dados: dados || {} });
    await this.repo.save(reg);
    return { ok: true, dados: reg.dados };
  }
}
