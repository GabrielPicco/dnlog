# DNLog — Pacote de Continuidade do Projeto

> **Documento de transferência** — preparado para que outra IA (ou outro desenvolvedor) consiga retomar o projeto sem perder contexto.
>
> **Data:** 20/05/2026 · **Versão:** 1.0

---

## 1. O que é o projeto

**DNLog** é um sistema de gestão de embarques para a **DN Seeds** (Luís Eduardo Magalhães-BA), empresa de sementes de soja. Cobre todo o fluxo de Ordens de Embarque (OE), conferência física, mapas de carga, fotos, modalidade triangular (fornecedor→cliente) e baixa de notas fiscais com integração ao **SAP Business One 10.0 (HANA) FP 2208**.

### Stakeholders

- **Cliente:** DN Seeds (sementes de soja em big bags ~900kg)
- **Parceiro SAP:** Agrotis (consultoria/implantação)
- **Hospedagem:** SkyOne (cloud; usuário é administrador)
- **Operação:** Luís Eduardo Magalhães-BA, com clientes em BA/TO/PI/MA
- **Usuário do projeto:** Gabriel (10 anos de experiência na área, não-programador, lidera a iniciativa)

### Perfis de usuário no app

| Perfil | Acesso |
|---|---|
| **OPERADOR** (Carlos) | Cria OEs, conferência, faturamento, todas as telas |
| **CONFERENTE** (Marina, Renato) | Só tela de Conferência + visualização de OE em PDF |
| **GESTOR** (Ana) | Visão completa + relatórios, sem alterar dados operacionais |

---

## 2. Estado atual do projeto

### O que ESTÁ pronto

**Frontend (HTML standalone):**
- App completo rodando em arquivo único HTML (~485 KB)
- React 18.3.1 + Babel standalone 7.24.7 (sem build step)
- Telas: Dashboard, Pedidos SAP, Detalhe de Pedido, Agendamentos, Calendário, Estoque, Conferência (com abas), Triangulares (fluxo 3-etapas), Consulta Embarques, Nova OE, Detalhe OE, Documento PDF
- LocalStorage `dnlog_v2` (persistente)
- Suporte a múltiplas paradas por OE
- Mapa de carga editável (vista superior + lateral)
- Sistema de lotes (alocação manual e via estoque)
- Fluxo triangular dedicado (Agendamento → Troca de nota → Liberação)
- Faturamento com baixa de saldo no pedido SAP

**Backend (NestJS + TypeScript):**
- Servidor Node.js rodando em `localhost:3000`
- Modo MOCK (dados simulados) funcionando 100%
- Cliente do SAP Service Layer pronto (não testado em ambiente real ainda)
- Endpoints: `/api/health`, `/api/pedidos`, `/api/clientes`, `/api/fornecedores`, `/api/itens`, `/api/itens/:codigo/lotes`, `/api/oe/faturar`, `/api/oe/triangular/troca-nota`

**Integração frontend ↔ backend:**
- HTML faz fetch automático ao backend ao iniciar (2s timeout)
- Mostra badge "API MOCK conectada" ou "API SAP conectada"
- Cai pra dados estáticos se backend offline

### Documentos entregues

- `DNLog-Solicitacao-Acessos.docx` — documento formal pra Agrotis e SkyOne pedirem acessos
- `dnlog-backend.zip` — backend completo (precisa Node.js 20+)
- `dnlog-app.html` — frontend standalone

---

## 3. BUG RESOLVIDO em 29/05/2026

> **Status:** ✅ Corrigido. A causa raiz era diferente da hipótese original
> — eram 3 bugs sobrepostos. Detalhes abaixo.

### Causas reais (3, não 1)

**Bug A — Mock com casing errado:**
`sap-mock.service.ts` retornava `itemCode` em camelCase, mas o controller
acessava `l.ItemCode` em PascalCase. JS é case-sensitive → `l.ItemCode`
era sempre `undefined`. Esse era o bug **principal**.

**Bug B — Syntax error no controller:**
Tentativa anterior de adicionar fallback deixou a linha `codigo: l.ItemCode, || "TESTE_MARCADOR"` com a vírgula antes do `||`, criando uma expressão inválida que o tsc não compilava. O `dist/` antigo continuava sendo servido sem o campo `codigo`.

**Bug C — SAP client com mesmo problema:**
`sap-client.service.ts` usava `itemCode` (camelCase) nos queries OData
do Service Layer. Quando a integração SAP HML real entrar, esse campo
viria vazio do SAP B1 também (que usa PascalCase). Bug latente,
silencioso, descoberto na mesma investigação.

### Fix aplicado

Padronização em **PascalCase** (formato canônico do SAP Business One
Service Layer) em todos os 3 lugares:

1. `sap-mock.service.ts`: 6 ocorrências `itemCode:` → `ItemCode:` nos
   `DocumentLines` + 4 shorthands `itemCode` → `ItemCode: itemCode` em
   `getBatchesForItem()`
2. `sap-client.service.ts`: `$select`, `$expand` e `$filter` com
   `itemCode` → `ItemCode` (3 alterações)
3. `api.controller.ts` linha 47:
   ```typescript
   codigo: l.ItemCode || `ITEM_${p.DocNum}_${l.LineNum ?? idx}`
   ```
   O fallback usa `LineNum` (sempre presente, é o índice da linha
   no SAP) garantindo unicidade mesmo se algum dia o campo vier vazio.

### Verificação

```bash
cd Downloads/dnlog-backend/dnlog-backend
rm -rf dist tsconfig.tsbuildinfo
npm run build    # zero erros
# dist/api/api.controller.js linha 48 agora tem o fallback
```

Iniciar com `iniciar-windows.bat` e refazer o teste original:
selecionar PV-12345 (KOITI ORITA) → clicar no item NEO 811 IPRO →
só ele deve marcar (não os dois).

---

## 3b. BUG anterior (mantido pra histórico)

### Sintoma
Na tela "Nova OE" → modalidade TRIANGULAR → seleciona pedido PV-12345 (KOITI ORITA, 2 itens: SOJA NEO 811 IPRO 15 BB e SOJA BRAUNA IPRO 10 BB) → clica em 1 item → **ambos ficam marcados** com check verde, **ambos com 15 BB** (errado, o segundo deveria ser 10 BB), ambos como "SEM LOTES INFORMADOS — A CARGO DO FORNECEDOR".

### Causa raiz identificada
O backend está retornando JSON dos pedidos **sem o campo `codigo`** nos itens. Sem `codigo`, o app não consegue distinguir 1 item de outro — quando o usuário clica em um, o React renderiza ambos como "selecionados" (porque `undefined === undefined` retorna `true`).

### Onde está o problema
Arquivo: `dnlog-backend/src/api/api.controller.ts`, método `getPedidos()`, linha 47.

Deve estar:
```typescript
itens: p.DocumentLines.map((l: any) => ({
  sap_line_num: l.LineNum,
  codigo: l.ItemCode,          // ← linha 47, esta É a correta
  descricao: l.ItemDescription,
  qtd_bb: l.Quantity,
  qtd_entregue: l.Quantity - l.OpenQuantity,
  saldo: l.OpenQuantity,
  valor_unitario: l.Price,
  armazem: l.WarehouseCode,
})),
```

### O que foi tentado (sem sucesso)
1. Verificar a linha 47 — está como `codigo: l.ItemCode,` (texto correto)
2. Reiniciar o backend várias vezes
3. Limpar cache TypeScript (`rm -rf dist`)
4. Modificar a linha pra `codigo: l.ItemCode || "TESTE_MARCADOR",` — gerou erros de sintaxe porque a vírgula estava no lugar errado

### Hipóteses ainda não testadas
1. **Pasta aninhada:** `Downloads/dnlog-backend/dnlog-backend/` — pode estar editando arquivo de uma cópia mas backend lê outra
2. **Cache do navegador:** mesmo com `Ctrl+F5`, o navegador pode estar cacheando a resposta
3. **Build incremental do TS** ficou corrompido após erros sucessivos

### Próximos passos sugeridos
1. **Apagar TUDO da pasta backend e baixar o zip de novo**, descompactar em pasta nova (ex: `C:\dnlog\`)
2. **Editar com VS Code** ao invés de Bloco de Notas (highlight de sintaxe pega esses erros)
3. **Adicionar console.log temporário** no controller:
   ```typescript
   const pedidosSap = await this.sap.getPedidosAbertos();
   console.log('PEDIDOS DO MOCK:', JSON.stringify(pedidosSap[0], null, 2));
   ```
4. **Alternativa de emergência:** garantir unicidade do código mesmo se vier undefined:
   ```typescript
   itens: p.DocumentLines.map((l: any, idx: number) => ({
     codigo: l.ItemCode || `ITEM_${p.DocNum}_${idx}`, // fallback único
     sap_line_num: l.LineNum,
     ...
   }))
   ```

---

## 4. Arquitetura técnica

### Stack

```
Frontend:  HTML standalone (file:// ou servidor estático)
           React 18.3.1 + Babel standalone 7.24.7
           LocalStorage (dnlog_v2)
           Sem build step (single-file)

Backend:   NestJS 10 + TypeScript
           Axios para comunicação SAP
           Roda em Node.js 20+
           Porta 3000

ERP:       SAP Business One 10.0 HANA FP 2208
           Service Layer REST/OData
           Hospedado na SkyOne
```

### Diagrama

```
┌─────────────────┐   HTTP    ┌──────────────────┐   OData    ┌──────────────┐
│  dnlog-app.html │ ────────► │  dnlog-backend   │ ─────────► │  SAP B1      │
│  (navegador)    │           │  (Node.js:3000)  │            │  (SkyOne)    │
│                 │ ◄──────── │  + mock embutido │ ◄───────── │  HML/PRD     │
└─────────────────┘           └──────────────────┘            └──────────────┘
```

### Fluxo de bootstrap do app

```javascript
1. HTML carrega
2. Babel compila os scripts JSX
3. Antes do React montar, bootstrapDNLog() roda:
   - fetch http://localhost:3000/api/health (timeout 2s)
   - Se OK: fetch /api/pedidos, /api/clientes, /api/fornecedores
   - Substitui let DADOS_PEDIDOS pelos dados do backend
   - Mostra badge no canto da tela
4. ReactDOM.createRoot().render(<App />)
5. App lê DADOS_PEDIDOS via useMemo pedidosComSaldo
```

---

## 5. Modelo de dados — campos críticos

### Pedido (formato do backend após adapter)

```typescript
{
  numero: string,           // "PV-12345"
  doc_entry: number,        // 101 (referência SAP)
  cliente: string,          // "KOITI ORITA"
  cliente_codigo: string,   // "C00001"
  data_emissao: string,     // "2026-04-15"
  data_entrega: string,     // "2026-05-25"
  vendedor: string,         // "LOURIVAL"
  tem_saldo: boolean,
  qtd_total_bb: number,
  qtd_saldo_bb: number,
  saldo_aberto: number,     // valor em R$
  itens: [{
    sap_line_num: number,   // 0, 1, 2... (índice da linha no SAP)
    codigo: string,         // "SOJ000015" ← FALTANDO NO BUG ATUAL
    descricao: string,
    qtd_bb: number,
    qtd_entregue: number,
    saldo: number,
    valor_unitario: number,
    armazem: string
  }]
}
```

### Ordem de Embarque (formato do app, salvo no localStorage)

```typescript
{
  id: string,
  numero: string,           // "OE-0001"
  status: 'RASCUNHO' | 'PROGRAMADA' | 'EM_CONFERENCIA' |
          'NOTA_TROCADA' | 'EMBARCADA' | 'EM_TRANSITO' |
          'ENTREGUE' | 'CANCELADA',
  modalidade: 'ESTOQUE_PROPRIO' | 'TRIANGULAR',
  data_prevista: string,
  hora_prevista: string,
  motorista_nome: string,
  motorista_cpf: string,    // formato "000.000.000-00"
  veiculo_placa: string,    // "AAA-1B23" ou "AAA-1234"
  veiculo_placa_uf: string, // "BA"
  veiculo_tipo: string,
  doca: string,
  fornecedor_nome?: string, // se TRIANGULAR

  // Multi-paradas
  paradas: [{
    id: string,
    ordem_carga: number,
    ordem_descarga: number,
    pedidosNumeros: string[],
    cliente: string,
    itensSelecionados: [{
      codigo: string,
      descricao: string,
      qtd_bb: number,
      valor_unitario: number,
      sap_line_num: number,
      pedido_numero: string,   // identifica origem em multi-pedidos
      lotes_alocados: [{
        lote_codigo: string,
        qtd_bb: number,
        sem_lotes_triangular?: boolean
      }]
    }]
  }],

  // Faturamento
  faturada: boolean,
  faturada_em: string,
  nf_numero: string,

  // Triangular específicos
  nf_fornecedor: string,
  nf_fornecedor_data: string,
  nf_qtds_conferem: boolean,
  hora_saida: string,
  embarcada_em: string,
}
```

### Mapeamento SAP ↔ DNLog

| Campo SAP (Service Layer) | Campo DNLog |
|---|---|
| `Order.DocNum` | `pedido.numero` (com prefixo PV-) |
| `Order.DocEntry` | `pedido.doc_entry` |
| `Order.CardName` | `pedido.cliente` |
| `Order.CardCode` | `pedido.cliente_codigo` |
| `Order.DocDate` | `pedido.data_emissao` |
| `Order.DocDueDate` | `pedido.data_entrega` |
| `Order.U_VENDEDOR` | `pedido.vendedor` |
| `Order.DocumentLines[].ItemCode` | `item.codigo` |
| `Order.DocumentLines[].ItemDescription` | `item.descricao` |
| `Order.DocumentLines[].Quantity` | `item.qtd_bb` |
| `Order.DocumentLines[].OpenQuantity` | `item.saldo` |
| `Order.DocumentLines[].Price` | `item.valor_unitario` |
| `Order.DocumentLines[].LineNum` | `item.sap_line_num` |

### UDFs sugeridos (Agrotis deve criar)

| Tabela | UDF | Tipo | Finalidade |
|---|---|---|---|
| ODLN (Delivery Note) | `U_DNLOG_OE` | Texto 20 | Número da OE do DNLog |
| ODLN | `U_PLACA` | Texto 10 | Placa do veículo |
| ODLN | `U_PLACA_UF` | Texto 2 | UF da placa |
| ODLN | `U_MOTORISTA_CPF` | Texto 14 | CPF do motorista |
| ODLN | `U_MODALIDADE` | Texto 15 | PROPRIO ou TRIANGULAR |
| OPOR (Purchase Order) | `U_DNLOG_OE` | Texto 20 | OE triangular vinculada |

---

## 6. Status do diálogo com Agrotis e SkyOne

**Documento `DNLog-Solicitacao-Acessos.docx` foi gerado** mas ainda não foi enviado.

### Precisamos receber da Agrotis:
1. URL do Service Layer (HML): `https://[servidor]:50000/b1s/v1/`
2. Nome da CompanyDB (HML): provavelmente `SBO_DNSEEDS_HML`
3. Usuário SAP dedicado: `dnlog_service` com senha
4. Permissões: leitura de Orders/BPs/Items/Batches, criação de DeliveryNotes/PurchaseOrders
5. Lista de UDFs já existentes na base
6. Criação dos UDFs novos (tabela acima)

### Precisamos receber da SkyOne:
1. VM Linux (Ubuntu 22.04, 4 vCPU, 8GB RAM) ou autorização pra rodar app externo
2. Liberação de firewall (porta 50000 do SAP)
3. Certificado SSL pro domínio do DNLog
4. Acesso SSH para deploy
5. Configuração de backup

---

## 7. Cronograma (estimativa)

| Fase | Duração | Status |
|---|---|---|
| 1. Frontend (HTML standalone) | 4 semanas | ✅ CONCLUÍDO |
| 2. Backend protótipo (mock) | 1 semana | ✅ CONCLUÍDO |
| 3. Integração com SAP HML | 4-6 semanas | ⏳ AGUARDANDO ACESSOS |
| 4. Homologação operacional | 4-6 semanas | ⏳ Pendente |
| 5. Go-live produção | 1-2 semanas | ⏳ Pendente |

**Estimativa total restante:** 3-5 meses

---

## 8. Decisões técnicas importantes

### Por que HTML standalone?
- Roda em qualquer máquina sem instalar nada
- File:// permite uso offline
- Ideal pra protótipo e demos
- Limitação: não pode usar imports ES modules (file:// bloqueia)
- Solução: Babel standalone compila JSX inline

### Por que NestJS no backend?
- TypeScript nativo (importante pra integrar com SAP que tem tipos complexos)
- Estrutura de módulos clara
- Dependency Injection facilita trocar mock por real
- Comunidade ativa, fácil pra outro dev assumir

### Por que mock e real no mesmo backend?
- `SapModule` injeta `SapClientService` ou `SapMockService` baseado em `process.env.USE_MOCK`
- Mesmo controller, mesma assinatura
- Trocar entre os dois é só mudar `.env`

### Sobre formato de pedidos
- App suporta 2 formatos (paradas multi-pedido e formato antigo) — não quebrar isso
- `getParadas(oe)` é helper que retorna array de paradas mesmo no formato antigo
- `getAllItens(oe)` retorna todos os itens flat

### Sobre identificação de itens
- Item identificado por `(codigo + pedido_numero)` em paradas multi-pedido
- `sap_line_num` é a referência canônica no SAP
- Key React: `${pedido_numero}_${item.codigo}` — falha se `codigo` é undefined (bug atual)

### Sobre lotes
- Modalidade TRIANGULAR não precisa de lote (fornecedor responde)
- Modalidade ESTOQUE_PROPRIO valida estoque disponível
- Lotes alocados ficam em `parada.itensSelecionados[].lotes_alocados`
- Flag `sem_lotes_triangular: true` quando usuário pula seleção em triangular

### Sobre mapa de carga
- Templates: truck (16 BB), truck6x2 (16), bitruck (24), bitrem (48), rodotrem (56)
- Estrutura: `andares × colunas × profundidade × num_carretas`
- Cada célula identifica BB por lote + parada + Remontado/Lastro

---

## 9. Memória do usuário (preferências)

- **Web app debugging:** quando bugs aparecerem, pedir print do DevTools Console (F12)
- **Bloco de Notas no Windows** é o editor disponível (sem VS Code instalado)
- **Gabriel usa Chrome** (visto pelos favoritos: Agrotis Portal, Skyone Console, Autosky Console)
- **Linguagem:** PT-BR sempre
- **Não é desenvolvedor** — precisa de orientação passo-a-passo, explicações simples
- **Erros comuns:** confunde maiúsculas/minúsculas em nomes de variáveis; pode digitar caracteres extras sem perceber ao editar arquivos no Bloco de Notas

---

## 10. Como retomar o projeto

### Para outra IA (Claude, ChatGPT, Gemini, etc.):

Use este documento como contexto inicial. Após carregá-lo, faça:

1. **Pegue o arquivo `dnlog-app.html`** (anexo)
2. **Pegue o `dnlog-backend.zip`** (anexo)
3. **Tente resolver o BUG da seção 3** primeiro

Sugestão: aborde com cuidado a edição do `api.controller.ts`. Recomende ao usuário instalar **VS Code** antes de tentar editar, pois o Bloco de Notas tem causado problemas de sintaxe sutis (vírgulas em lugar errado, pipes acidentais).

### Para um desenvolvedor humano:

1. Leia este documento inteiro
2. Descompacte o backend em pasta limpa (NÃO sobreponha a anterior)
3. `npm install && npm run start:dev`
4. Confirme `http://localhost:3000/api/pedidos` retorna `"codigo"` nos itens
5. Abra o HTML, confirme o badge "API conectada"
6. Reproduza o bug seguindo a seção 3 → resolva

### Comandos úteis

```bash
# Iniciar backend
cd dnlog-backend
npm install
npm run start:dev

# Testar endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/api/pedidos

# Limpar cache TS (se compilação travar)
rm -rf dist node_modules tsconfig.tsbuildinfo
npm install
```

---

## 11. Histórico de iterações principais

1. Criação do app standalone com mock data
2. Mapa de carga com vista superior/lateral
3. Conferência com abas (Aguardando/Em conferência/Conferidas hoje/Todas)
4. Faturamento com baixa no pedido SAP
5. Detalhe de pedido (substituiu "clicar = abrir Nova OE")
6. Triangulares fora da conferência + fluxo 3-etapas dedicado
7. Validações de placa, CPF, UF
8. Múltiplos pedidos do mesmo cliente numa parada
9. Backend NestJS + mock
10. Adapter de bootstrap no HTML
11. **Bug atual:** codigo ausente nos itens da resposta do backend

---

## 12. Arquivos anexos a este pacote

| Arquivo | Tamanho | Descrição |
|---|---|---|
| `dnlog-app.html` | ~485 KB | App completo standalone |
| `dnlog-backend.zip` | ~21 KB | Backend NestJS + mock |
| `DNLog-Solicitacao-Acessos.docx` | ~80 KB | Documento pra Agrotis/SkyOne |
| `dnlog-projeto.md` | (este) | Documento de contexto |

---

## 13. Contato e continuidade

**Usuário do projeto:** Gabriel (Picco)
- Trabalha na DN Seeds (área ASA)
- 10 anos de experiência logística no agro
- Localização: Luís Eduardo Magalhães, BA
- Não é desenvolvedor

**Tecnologia preferida pra continuar:**
- Manter HTML standalone (sem build) enquanto for protótipo
- NestJS no backend
- Trabalhar em Windows

**O que esperar de outra IA assumindo:**
- Ler este documento inteiro
- Não recomeçar do zero
- Não mudar a stack (HTML+React+NestJS está funcionando)
- Resolver primeiro o bug atual (seção 3)
- Continuar incremento gradual

---

## 14. Sugestões de melhoria futura (backlog)

- Versionamento automático do localStorage (migração transparente)
- Botão "Resetar dados" e "Forçar atualização" no app
- Drag-and-drop no mapa de carga
- Atalhos de teclado (1, 2, 3 pra escolher parada ativa)
- Anexar PDF/foto da NF do fornecedor no fluxo triangular
- Conferência de lacre e peso bruto
- Modo escuro/claro (hoje só escuro)
- Exportar relatórios mensais em Excel
- Notificações para conferentes (email/WhatsApp)
- App mobile dedicado pra conferentes (PWA)

---

**FIM DO DOCUMENTO**
