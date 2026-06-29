# DNLog Backend

Backend de integração entre o app DNLog e o SAP Business One.

## O que esse projeto faz

Esse programa é um "intermediário" entre o app DNLog (que roda no navegador) e o SAP. Ele:

- Recebe requisições do app (ex: "me liste os pedidos abertos")
- Conversa com o SAP via Service Layer
- Devolve os dados em formato amigável para o app

Sem esse backend, o app **não pode falar diretamente com o SAP** (por questões de segurança e CORS — o SAP não aceita conexões diretas de navegador).

## Como rodar (primeira vez)

### 1. Instalar o Node.js

Baixe e instale o Node.js versão 20 ou mais nova:

- **Windows / Mac:** https://nodejs.org (escolha "LTS")
- **Linux Ubuntu:** `sudo apt install nodejs npm`

Confirme que instalou abrindo o terminal e digitando:

```
node --version
```

Deve aparecer algo como `v20.x.x`.

### 2. Iniciar o backend

**Windows:** Dê duplo clique em `iniciar-windows.bat`

**Mac/Linux:** No terminal, dentro da pasta do projeto, execute:
```
./iniciar-mac-linux.sh
```

Na primeira vez vai demorar uns 2 minutos (baixando dependências). Depois é instantâneo.

Quando aparecer:

```
============================================================
DNLog Backend rodando na porta 3000
Modo: MOCK (SAP simulado)
API disponivel em: http://localhost:3000/api
============================================================
```

Está funcionando!

### 3. Testar

Abra o navegador em: http://localhost:3000/api/health

Deve aparecer:
```json
{ "status": "ok", "modo": "mock", "timestamp": "..." }
```

E em: http://localhost:3000/api/pedidos

Vai aparecer a lista de pedidos simulados (modo mock).

## Modo MOCK vs Modo SAP REAL

Por padrão, o backend roda em **modo MOCK** — finge ser o SAP e retorna dados fake. Isso permite desenvolver e demonstrar o DNLog sem precisar do SAP de verdade configurado.

### Para alternar para SAP real

1. Abra o arquivo `.env` (criado automaticamente na primeira execução)
2. Mude `USE_MOCK=true` para `USE_MOCK=false`
3. Preencha as informações que a Agrotis vai fornecer:

```env
SAP_SERVICE_LAYER_URL=https://homolog.skyone.solutions:50000/b1s/v1
SAP_COMPANY_DB=SBO_DNSEEDS_HML
SAP_USERNAME=dnlog_service
SAP_PASSWORD=senha_recebida_da_agrotis
```

4. Reinicie o backend (Ctrl+C e rode de novo)

## Endpoints disponíveis

Todos em `http://localhost:3000/api/`

| Método | URL | O que faz |
|---|---|---|
| GET | `/health` | Verifica se o backend está vivo |
| GET | `/pedidos` | Lista pedidos de venda abertos |
| GET | `/clientes` | Lista todos os clientes |
| GET | `/fornecedores` | Lista fornecedores (para triangular) |
| GET | `/itens` | Lista itens (sementes) cadastrados |
| GET | `/itens/SOJ000015/lotes` | Lotes disponíveis de um item |
| POST | `/oe/faturar` | Cria uma Delivery Note (baixa estoque) |
| POST | `/oe/triangular/troca-nota` | Cria Purchase Order triangular |

## Estrutura do projeto

```
dnlog-backend/
├── src/
│   ├── main.ts                    Ponto de entrada do servidor
│   ├── app.module.ts              Módulo raiz
│   ├── sap/
│   │   ├── sap-client.service.ts  Cliente do SAP Service Layer (real)
│   │   ├── sap-mock.service.ts    Mock do SAP (dados fake)
│   │   └── sap.module.ts          Alterna entre real e mock
│   └── api/
│       ├── api.controller.ts      Endpoints REST consumidos pelo DNLog
│       └── api.module.ts
├── .env                           Configurações (não commitar)
├── .env.example                   Modelo de configuração
├── package.json
├── tsconfig.json
├── iniciar-windows.bat            Script Windows
└── iniciar-mac-linux.sh           Script Mac/Linux
```

## Próximos passos (depois que a Agrotis responder)

1. **Receber da Agrotis:**
   - URL do Service Layer
   - Nome da CompanyDB
   - Usuário e senha do `dnlog_service`
   - Lista de UDFs existentes / criados

2. **Configurar `.env`** com esses dados

3. **Trocar `USE_MOCK=false`**

4. **Testar** cada endpoint na ordem:
   - `/api/health`
   - `/api/clientes` (mais simples, valida login)
   - `/api/pedidos` (valida leitura mais complexa)
   - `/api/itens/SOJ000015/lotes` (valida UDFs)
   - `/api/oe/faturar` (valida escrita — PRIMEIRO em HML!)

5. **Ajustar mapeamento de campos** se a estrutura SAP da DN Seeds for diferente do padrão

## Problemas comuns

### "Cannot find module" ao iniciar

Apague a pasta `node_modules` e rode o script de iniciar de novo. Vai reinstalar tudo.

### "Port 3000 already in use"

Outro programa está usando a porta. Edite o `.env` e mude `PORT=3001`.

### "Falha no login SAP: ECONNREFUSED"

O Service Layer não está acessível. Verifique:
- A URL está correta?
- Sua máquina consegue alcançar o servidor? (`ping` no IP do SAP)
- Firewall liberou a porta 50000?

### "Falha no login SAP: 401 Unauthorized"

Usuário ou senha errados. Confira com a Agrotis.

### "Falha no login SAP: 500"

Provavelmente o nome da CompanyDB está errado. Peça pra Agrotis confirmar.

## Suporte

Problemas técnicos: documente o erro completo (mensagem que aparece no terminal) e descreva o que estava tentando fazer. Esses backends de integração SAP costumam dar erros bem específicos — quanto mais detalhe, mais rápido resolvemos.
