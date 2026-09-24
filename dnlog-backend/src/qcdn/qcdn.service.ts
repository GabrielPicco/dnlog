import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * Cliente do QCDN (sistema de Controle de Qualidade). Fala com a API de
 * integração /api/integ/** do QCDN usando um token bearer guardado no servidor
 * (envs QCDN_BASE_URL + QCDN_API_TOKEN) — o token NUNCA vai ao navegador.
 *
 * Usado na tela de embarque do DNLog para (a) mostrar os lotes reservados de
 * cada cliente/pedido e (b) dar baixa (parcial) na reserva quando a carga
 * embarca.
 */
@Injectable()
export class QcdnService {
  private readonly logger = new Logger(QcdnService.name);
  private http: AxiosInstance | null = null;

  constructor(private readonly config: ConfigService) {}

  private client(): AxiosInstance | null {
    const base = this.config.get<string>('QCDN_BASE_URL');
    const token = this.config.get<string>('QCDN_API_TOKEN');
    if (!base || !token) return null;
    if (!this.http) {
      this.http = axios.create({
        baseURL: base.replace(/\/+$/, ''),
        timeout: 15000,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    }
    return this.http;
  }

  configurado(): boolean {
    return !!this.client();
  }

  /** Lista as reservas do cliente no QCDN (por CardCode, com fallback por nome). */
  async listarReservas(params: { cardCode?: string; nome?: string; lotes?: string[] }) {
    const http = this.client();
    if (!http) return { ok: false, configurado: false, reservas: [], erro: 'Integração QCDN não configurada.' };
    try {
      const resp = await http.get('/api/integ/reservas', {
        params: {
          cardCode: params.cardCode || undefined,
          nome: params.nome || undefined,
          lotes: params.lotes && params.lotes.length ? params.lotes.join(',') : undefined,
        },
      });
      return { ok: true, configurado: true, ...resp.data };
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'erro';
      this.logger.warn(`listarReservas falhou: ${msg}`);
      return { ok: false, configurado: true, reservas: [], erro: msg };
    }
  }

  /** Reservas em aberto POR LOTE (todos os clientes) — telas de estoque. */
  async listarReservasPorLote(params: { lotes?: string[]; todas?: boolean }) {
    const http = this.client();
    if (!http) return { ok: false, configurado: false, reservas: [], erro: 'Integração QCDN não configurada.' };
    try {
      const resp = await http.get('/api/integ/reservas-lotes', {
        params: {
          lotes: params.lotes && params.lotes.length ? params.lotes.join(',') : undefined,
          todas: params.todas ? '1' : undefined,
        },
      });
      return { ok: true, configurado: true, ...resp.data };
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'erro';
      this.logger.warn(`listarReservasPorLote falhou: ${msg}`);
      return { ok: false, configurado: true, reservas: [], erro: msg };
    }
  }

  /** Registra uma baixa (parcial) contra uma reserva do QCDN. Idempotente por OE+lote. */
  async darBaixa(payload: {
    reservaId: string;
    quantidadeBags: number;
    pedidoSap?: string;
    oeNumero: string;
    loteNumero?: string;
    observacoes?: string;
  }) {
    const http = this.client();
    if (!http) return { ok: false, configurado: false, erro: 'Integração QCDN não configurada.' };
    try {
      const resp = await http.post('/api/integ/baixa', payload);
      return { ok: true, configurado: true, ...resp.data };
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || 'erro';
      this.logger.warn(`darBaixa falhou (${status}): ${msg}`);
      return { ok: false, configurado: true, status, erro: msg };
    }
  }
}
