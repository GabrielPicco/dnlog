import { Injectable, Logger } from '@nestjs/common';

/**
 * Cache em memória com TTL curto + de-duplicação de chamadas concorrentes.
 *
 * Objetivo: aliviar o SAP. Vários usuários (e reloads) dentro da janela de TTL
 * batem no cache, não no Service Layer. E se N requisições chegarem juntas com
 * o cache frio, TODAS compartilham uma única busca (evita "thundering herd" —
 * e de quebra elimina a corrida que às vezes trazia catálogos vazios).
 *
 * É só para LEITURA (GET). Nada é escrito no SAP. Após uma escrita (faturar),
 * chame invalidate() para não servir dado velho.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly store = new Map<string, { value: any; expira: number }>();
  private readonly inflight = new Map<string, Promise<any>>();

  /** TTL padrão (ms). Configurável por env CACHE_TTL_MS; 0 (ou negativo) desliga. */
  private get ttlPadrao(): number {
    const v = Number(process.env.CACHE_TTL_MS);
    return Number.isFinite(v) ? v : 180000; // 3 minutos
  }

  /**
   * Retorna do cache se fresco; senão executa fn (compartilhando com chamadas
   * concorrentes), guarda o resultado e o devolve. Erros NÃO são cacheados.
   *
   * @param cacheIf opcional: só guarda se retornar true (ex.: não cachear um
   *        resumo que veio sem grupos). Se omitido, guarda sempre.
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs?: number,
    cacheIf?: (value: T) => boolean,
  ): Promise<T> {
    const ttl = ttlMs != null ? ttlMs : this.ttlPadrao;
    if (ttl <= 0) return fn(); // cache desligado

    const hit = this.store.get(key);
    if (hit && hit.expira > Date.now()) return hit.value;

    // Já há uma busca em andamento para essa chave? Compartilha (não abre outra).
    const emAndamento = this.inflight.get(key);
    if (emAndamento) return emAndamento;

    const p = (async () => {
      try {
        const value = await fn();
        if (!cacheIf || cacheIf(value)) {
          this.store.set(key, { value, expira: Date.now() + ttl });
        }
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /** Limpa uma chave (ou tudo, sem argumento). Usar após escrita no SAP. */
  invalidate(key?: string): void {
    if (key) this.store.delete(key);
    else this.store.clear();
    this.logger.debug(`cache invalidado: ${key || 'TUDO'}`);
  }
}
