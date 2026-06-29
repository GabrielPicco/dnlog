# DNLog — Como tudo se conecta

## Visão geral

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dnlog-app.html     │ ──► │  dnlog-backend   │ ──► │  SAP B1      │
│  (navegador)        │     │  (Node.js)       │     │  Service     │
│                     │ ◄── │  porta 3000      │ ◄── │  Layer       │
└─────────────────────┘     └──────────────────┘     └──────────────┘
       Frontend                   Backend                  ERP
   (você baixa aqui)         (roda no seu PC          (na SkyOne)
                              ou servidor)
```

## O que cada peça faz

### 1. dnlog-app.html (Frontend)
O **app que você já vem testando**. Roda no navegador, mostra telas, formulários, etc.

Hoje, esse HTML lê **dados estáticos** (do JSON embutido). A partir de agora, ele pode opcionalmente puxar dados do backend (que por sua vez puxa do SAP).

### 2. dnlog-backend (Backend)
Programa Node.js que roda na sua máquina (ou no servidor da SkyOne em produção).

**Por que precisamos dele?**
- O SAP **não aceita conexão direta de navegador** (CORS)
- Credenciais do SAP **não podem ficar no JavaScript** do navegador (qualquer um veria)
- Precisa **gerenciar sessão** do SAP (login a cada 30 min)
- Centraliza lógica de negócio

### 3. SAP B1 (na SkyOne)
O ERP que vocês já usam. **Não muda nada nele** — o backend só conversa via API.

## Fluxo de uso

### Modo MOCK (agora — sem precisar do SAP)

1. Você baixa o `dnlog-backend.zip`, descompacta
2. Roda `iniciar-windows.bat`
3. O backend sobe com **dados fake** (mas realistas)
4. Abre o `dnlog-app.html` no navegador — funciona normalmente
5. **Demonstra pra diretoria** sem depender de nada externo

### Modo SAP REAL (depois da Agrotis responder)

1. Recebe URL/credenciais da Agrotis
2. Edita `.env` do backend (3 linhas)
3. Muda `USE_MOCK=true` pra `false`
4. Reinicia o backend
5. Agora, ao abrir o app, **dados vêm do SAP real**

**Importante:** primeiro plugamos em HOMOLOGAÇÃO. Só depois de testar bem, vai pra produção.

## Próximos marcos

### Marco 1 — Demo offline (essa semana)
✅ Backend pronto
✅ Mock com dados realistas
✅ App adaptado
⏳ Você roda local e mostra pra diretoria

### Marco 2 — Conectar HML SAP (quando Agrotis responder)
⏳ Receber URL + credenciais
⏳ Configurar `.env`
⏳ Testar endpoints um a um
⏳ Ajustar mapeamento de campos se necessário

### Marco 3 — Homologação operacional (4-6 semanas)
⏳ Treinar usuários
⏳ Rodar em paralelo com processo atual
⏳ Coletar feedback e ajustar

### Marco 4 — Go-live produção (1-2 semanas)
⏳ Janela de manutenção combinada
⏳ Migração de OEs em aberto
⏳ Acompanhamento próximo nos primeiros dias

## Arquivos entregues nesta sessão

1. **dnlog-backend/** — projeto completo do backend (pasta com vários arquivos)
2. **DNLog-Solicitacao-Acessos.docx** — documento pra mandar pra Agrotis/SkyOne
3. **dnlog-app.html** — aplicativo (já tinha antes, continua igual)
4. **dnlog-projeto.md** — documentação técnica geral do projeto

## Quem faz o quê

| Tarefa | Quem | Quando |
|---|---|---|
| Rodar o backend mock localmente | Você | Agora |
| Demonstrar pra diretoria | Você | Essa semana |
| Mandar docx pra Agrotis | Você | Essa semana |
| Receber acessos SAP HML | Agrotis | 1-2 semanas |
| Configurar `.env` com dados reais | Você ou TI | Quando chegarem os acessos |
| Testar integração HML | Você + eu (Claude) | 2-3 semanas |
| Ajustes técnicos no código | Claude | Conforme necessário |
| Treinamento dos usuários | Você | Após HML validado |
| Go-live produção | Você + Agrotis + SkyOne | 4-6 meses do início |
