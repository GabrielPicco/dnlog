// ============================================================
// DNLog — Adaptador de API
// ============================================================
// Esse arquivo SUBSTITUI a leitura dos JSONs estáticos do app
// (DADOS, AUXILIARES, LOTES) por chamadas ao backend.
//
// Como usar:
// 1. Coloque este arquivo na mesma pasta do dnlog-app.html
// 2. Adicione no <head> do HTML:
//    <script src="dnlog-api-adapter.js"></script>
// 3. O adapter sobrescreve window.DADOS automaticamente após carregar
//
// ============================================================

const API_BASE = 'http://localhost:3000/api';

window.DNLOG_API = {
  base: API_BASE,

  async health() {
    const r = await fetch(`${API_BASE}/health`);
    return r.json();
  },

  async getPedidos() {
    const r = await fetch(`${API_BASE}/pedidos`);
    if (!r.ok) throw new Error('Falha ao buscar pedidos');
    return r.json();
  },

  async getClientes() {
    const r = await fetch(`${API_BASE}/clientes`);
    return r.json();
  },

  async getFornecedores() {
    const r = await fetch(`${API_BASE}/fornecedores`);
    return r.json();
  },

  async getItens() {
    const r = await fetch(`${API_BASE}/itens`);
    return r.json();
  },

  async getLotesItem(codigo) {
    const r = await fetch(`${API_BASE}/itens/${codigo}/lotes`);
    return r.json();
  },

  async faturarOE(payload) {
    const r = await fetch(`${API_BASE}/oe/faturar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const erro = await r.json();
      throw new Error(erro.sap_error || erro.message || 'Falha ao faturar');
    }
    return r.json();
  },

  async triangularTrocaNota(payload) {
    const r = await fetch(`${API_BASE}/oe/triangular/troca-nota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
};

// Auto-inicialização: tenta carregar dados do backend
// Se falhar, mostra aviso mas mantém os dados estáticos (modo offline)
(async function inicializar() {
  try {
    const health = await window.DNLOG_API.health();
    console.log('[DNLog API] Backend conectado:', health.modo);

    // Sobrescreve DADOS globais com os do backend
    const [pedidos, clientes, fornecedores, itens] = await Promise.all([
      window.DNLOG_API.getPedidos(),
      window.DNLOG_API.getClientes(),
      window.DNLOG_API.getFornecedores(),
      window.DNLOG_API.getItens(),
    ]);

    // Substitui as variáveis globais usadas pelo app
    if (window.DADOS) window.DADOS.pedidos = pedidos;
    if (window.AUXILIARES) {
      window.AUXILIARES.clientes = clientes.map(c => c.nome);
      window.AUXILIARES.fornecedores = fornecedores.map(f => f.nome);
    }

    // Avisa o app que dados mudaram (se app tiver um listener)
    window.dispatchEvent(new CustomEvent('dnlog-api-ready', {
      detail: { modo: health.modo, pedidos, clientes, fornecedores, itens }
    }));

    // Indicador visual no canto
    setTimeout(() => {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#1F8A4C;color:white;padding:6px 12px;border-radius:4px;font-size:11px;font-family:monospace;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
      badge.innerHTML = `✓ API ${health.modo === 'mock' ? 'MOCK' : 'SAP'} conectada`;
      document.body.appendChild(badge);
      setTimeout(() => badge.remove(), 4000);
    }, 500);

  } catch (err) {
    console.warn('[DNLog API] Backend indisponível, usando dados estáticos:', err.message);
    // Indicador de erro
    setTimeout(() => {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#B53939;color:white;padding:6px 12px;border-radius:4px;font-size:11px;font-family:monospace;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
      badge.innerHTML = '⚠ Backend offline (modo standalone)';
      document.body.appendChild(badge);
      setTimeout(() => badge.remove(), 5000);
    }, 500);
  }
})();
