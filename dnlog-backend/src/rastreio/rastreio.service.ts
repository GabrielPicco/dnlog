import { Inject, Injectable, Logger } from '@nestjs/common';
import { SAP_SERVICE } from '../sap/sap.module';
import { OeService } from '../oe/oe.service';
import { QcdnService } from '../qcdn/qcdn.service';
import { CacheService } from '../common/cache.service';

const norm = (x: any) => String(x ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
// "Baseado em Pedidos de venda 96." -> { tipo: 'PV', num: 96 }
const pedidoDoComentario = (c: string | null) => {
  const m = String(c || '').match(/Pedidos? de (venda|compra)\s+(\d+)/i);
  return m ? { tipo: m[1].toLowerCase() === 'venda' ? 'PV' : 'PC', num: Number(m[2]) } : null;
};
const numPedido = (p: any) => {
  const m = String(p || '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};
// Documentos que representam entrega ao cliente (saída) ou devolução dele.
const ENT_CLIENTE = new Set(['Invoices', 'DeliveryNotes', 'Returns', 'CreditNotes']);

/**
 * Rastreio de lote: junta o histórico de movimentações do SAP, o saldo atual,
 * as OEs do DNLog e as reservas/laudos do QCDN, e aponta as divergências.
 * Tudo somente leitura (SAP e QCDN).
 */
@Injectable()
export class RastreioService {
  private readonly logger = new Logger(RastreioService.name);

  constructor(
    @Inject(SAP_SERVICE) private readonly sap: any,
    private readonly oeService: OeService,
    private readonly qcdn: QcdnService,
    private readonly cache: CacheService,
  ) {}

  async rastrear(lotesParam: string[]) {
    const lista = Array.from(new Set(lotesParam.map((l) => l.trim()).filter(Boolean))).slice(0, 10);
    if (!lista.length) return { ok: true, lotes: [] };

    const [saldoLinhas, oesAll, qual, res] = await Promise.all([
      this.cache.wrap('rastreio:saldo-lotes', async () => (await this.sap.getSaldoPorLote?.()) ?? [], 120000),
      this.oeService.findAll(),
      this.qcdn.qualidadeLotes(lista),
      this.qcdn.listarReservasPorLote({ lotes: lista, todas: true }),
    ]);

    const lotes: any[] = [];
    for (const lote of lista) {
      // Um lote por vez (o histórico abre vários documentos no SAP).
      const hist: any = await this.cache.wrap(
        `rastreio:mov:${norm(lote)}`,
        async () => (this.sap.getMovimentosLote ? this.sap.getMovimentosLote(lote) : { lote: norm(lote), cadastro: [], movimentos: [], erros: ['indisponível no modo mock'] }),
        120000,
      );
      lotes.push(this.montar(lote, hist, saldoLinhas as any[], oesAll as any[], qual, res));
    }
    return {
      ok: true,
      qcdn: { configurado: qual?.configurado !== false, erro: qual?.ok === false ? qual?.erro : null },
      lotes,
    };
  }

  private montar(lote: string, hist: any, saldoLinhas: any[], oesAll: any[], qual: any, res: any) {
    const alvo = norm(lote);
    const alertas: { nivel: 'erro' | 'aviso' | 'info'; texto: string }[] = [];

    // ---- OEs do DNLog com este lote ----
    const oes: any[] = [];
    for (const oe of oesAll || []) {
      const paradas = Array.isArray(oe.paradas) ? oe.paradas : [{ pedido_numero: oe.pedido_numero, cliente: oe.cliente, itens: oe.itens || [] }];
      for (const p of paradas) for (const it of p.itens || []) for (const la of it.lotes_alocados || []) {
        if (norm(la.lote_codigo) !== alvo) continue;
        oes.push({
          oe: oe.numero, id: oe.id, status: oe.status, faturada: !!oe.faturada,
          nfs: String(oe.nf_numero || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean),
          criada: oe.criado_em || null, faturadaEm: oe.faturada_em || null,
          cliente: p.cliente || oe.cliente || null, pedido: it.pedido_numero || p.pedido_numero || null,
          item: it.codigo, qtd: Number(la.qtd_bb) || 0, modalidade: p.modalidade || oe.modalidade || null,
        });
      }
    }

    // ---- Movimentos: no mesmo dia, as ENTRADAS primeiro (o SAP não deixa o lote
    // ficar negativo); depois o resto na ordem do documento — assim a nota original
    // sempre aparece antes do próprio cancelamento.
    const ENTRADAS = new Set(['PurchaseDeliveryNotes', 'PurchaseInvoices', 'InventoryGenEntries', 'Returns', 'CreditNotes']);
    const rank = (m: any) => (ENTRADAS.has(m.entidade) && !String(m.tipo || '').includes('CANCELAMENTO') ? 0 : 1);
    const movs = [...(hist?.movimentos || [])].sort((a: any, b: any) =>
      (a.data || '').localeCompare(b.data || '') || (rank(a) - rank(b)) || (a.docEntry - b.docEntry));
    const acum: Record<string, number> = {};
    const movimentos = movs.map((m: any) => {
      const delta = (Number(m.qtd) || 0) * (Number(m.sinal) || 0);
      acum[m.item] = (acum[m.item] || 0) + delta;
      const ped = pedidoDoComentario(m.comentario);
      // Liga a saída à OE do DNLog pela NF (+ lote) — ou pelo pedido, se a OE não tem NF.
      const oe = m.nf != null && m.sinal < 0
        ? oes.find((o) => o.nfs.includes(String(m.nf)) && o.status !== 'CANCELADA')
          || (ped && ped.tipo === 'PV' ? oes.find((o) => !o.nfs.length && o.status !== 'CANCELADA' && numPedido(o.pedido) === ped.num) : null)
        : null;
      return {
        data: m.data, tipo: m.tipo, entidade: m.entidade, docNum: m.docNum, nf: m.nf, serie: m.serie,
        parceiro: m.parceiro, cardCode: m.cardCode, item: m.item, armazem: m.armazem, armazemOrigem: m.armazemOrigem,
        qtd: Number(m.qtd) || 0, delta, saldoApos: acum[m.item], cancelado: !!m.cancelado,
        pedido: ped ? `${ped.tipo}-${ped.num}` : null, oe: oe ? oe.oe : null,
      };
    });

    // ---- Saldo atual (SAP) por item ----
    const saldo = (saldoLinhas || []).filter((r: any) => norm(r.Lote) === alvo).map((r: any) => ({
      item: r.CodigoItem, descricao: r.NomeItem, armazem: r.CodigoDeposito, armazemNome: r.NomeDeposito,
      saldo: Number(r.SaldoAtual) || 0, validade: r.ExpDate || null,
    }));
    const saldoPorItem: Record<string, number> = {};
    for (const s of saldo) saldoPorItem[s.item] = (saldoPorItem[s.item] || 0) + s.saldo;

    const cadastro = hist?.cadastro || [];
    const itens = Array.from(new Set([...cadastro.map((c: any) => c.item), ...Object.keys(acum), ...Object.keys(saldoPorItem)].filter(Boolean)));
    const conferencia = itens.map((item) => {
      const entradas = movimentos.filter((m) => m.item === item && m.delta > 0).reduce((a, m) => a + m.delta, 0);
      const saidas = -movimentos.filter((m) => m.item === item && m.delta < 0).reduce((a, m) => a + m.delta, 0);
      const calculado = acum[item] || 0;
      const sap = saldoPorItem[item] || 0;
      return { item, descricao: cadastro.find((c: any) => c.item === item)?.descricao || null, entradas, saidas, calculado, saldoSap: sap, diferenca: sap - calculado };
    });

    // ---- QCDN: qualidade e reservas ----
    const qualidade = (qual?.lotes || []).find((q: any) => norm(q.numero) === alvo) || null;
    const reservas = (res?.reservas || []).filter((r: any) => norm(r.loteNumero) === alvo);

    // ---- Divergências ----
    if (!cadastro.length) alertas.push({ nivel: 'erro', texto: 'Lote não encontrado no cadastro de lotes do SAP.' });
    if (cadastro.length > 1) {
      alertas.push({ nivel: 'aviso', texto: `O mesmo número de lote está cadastrado em ${cadastro.length} itens no SAP (${cadastro.map((c: any) => c.item).join(', ')}). As reservas do QCDN são pelo número do lote e não distinguem o item.` });
    }
    for (const c of conferencia) {
      if (Math.abs(c.diferenca) > 0.001) {
        alertas.push({ nivel: 'erro', texto: `${c.item}: as movimentações somam ${c.calculado}, mas o SAP mostra saldo ${c.saldoSap} (diferença ${c.diferenca > 0 ? '+' : ''}${c.diferenca}). Provável documento sem o lote informado na linha.` });
      }
    }
    for (const o of oes) {
      if (o.status === 'CANCELADA' || o.faturada) continue;
      const nfSap = movimentos.find((m) => m.delta < 0 && !m.cancelado && m.pedido && numPedido(m.pedido) === numPedido(o.pedido) && m.item === o.item);
      if (nfSap) {
        alertas.push({ nivel: 'aviso', texto: `${o.oe} (${o.cliente || '—'}) está "${o.status}" e não marcada como faturada, mas a NF ${nfSap.nf} já foi emitida no SAP em ${nfSap.data}.` });
      }
    }
    for (const r of reservas) {
      if (!r.clienteCardCode) continue;
      const entregueSap = -movimentos
        .filter((m) => ENT_CLIENTE.has(m.entidade) && m.cardCode === r.clienteCardCode)
        .reduce((a, m) => a + m.delta, 0);
      const naoBaixado = Math.min(entregueSap, r.reservado) - (r.entregue || 0);
      if (naoBaixado > 0.001) {
        alertas.push({ nivel: 'aviso', texto: `Reserva QCDN de ${r.clienteNome}: o SAP mostra ${entregueSap} un entregues deste lote, mas o QCDN registra só ${r.entregue} — ${naoBaixado} a baixar.` });
      }
    }
    const saldoTotal = saldo.reduce((a: number, s: any) => a + s.saldo, 0);
    if (qualidade && qualidade.statusAprovacao === 'REPROVADO') {
      const ativas = oes.filter((o) => o.status !== 'CANCELADA' && !o.faturada);
      if (saldoTotal > 0 || ativas.length) {
        alertas.push({ nivel: 'erro', texto: `Lote REPROVADO no QCDN${qualidade.motivoReprovacao ? ` (${qualidade.motivoReprovacao})` : ''} com ${saldoTotal} un em estoque${ativas.length ? ` e ${ativas.length} OE(s) ativa(s)` : ''}.` });
      }
    }
    if (qual?.ok && !qualidade) alertas.push({ nivel: 'info', texto: 'Lote não cadastrado no QCDN (sem dados de qualidade).' });
    for (const e of hist?.erros || []) alertas.push({ nivel: 'info', texto: `SAP: ${e}` });

    return {
      lote: alvo,
      cadastro,
      saldo,
      saldoTotal,
      conferencia,
      movimentos,
      oes,
      reservas,
      qualidade,
      alertas,
    };
  }
}
