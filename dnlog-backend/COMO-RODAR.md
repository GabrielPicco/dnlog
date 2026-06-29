# Como rodar o DNLog Backend

> **Importante:** o backend roda em **disco local**, não direto do Google Drive.
> O `node_modules` tem ~20 mil arquivos e o Drive não sincroniza isso de forma
> confiável. Por isso ele vem compactado em `node_modules.zip`.

## Passo a passo (primeira vez)

1. **Copie a pasta `dnlog-backend` inteira do Drive para um lugar local**, por
   exemplo `C:\dnlog-backend`. (Arraste no Explorer.)

2. **Extraia o `node_modules.zip`** dentro dessa pasta local. No Windows
   Explorer: botão direito em `node_modules.zip` → "Extrair tudo..." → extraia
   na própria pasta `dnlog-backend`. Deve ficar `dnlog-backend\node_modules\`.

   > Se já existir uma pasta `node_modules` (parcial, sobra do Drive),
   > **apague ela antes de extrair** — no disco local a remoção funciona normal.
   > O `node_modules` completo e válido é o que está dentro do `.zip`.

3. **Crie o arquivo `.env`** (copie de `.env.example`) e ajuste:
   - `USE_MOCK=true` para testar com dados simulados (sem SAP).
   - `DB_TYPE=sqlite` para guardar as OEs num arquivo local (padrão, zero config).
   - `API_KEY=` uma chave longa e aleatória (deixe vazio só em desenvolvimento).
   - `CORS_ORIGIN=` o domínio do frontend DNLog em produção.

4. **⚠️ Instale as dependências novas (banco de dados).**
   A partir de 12/06/2026 o backend salva as OEs num banco (TypeORM). O
   `node_modules.zip` antigo **não tem** esses pacotes. Então rode uma vez:
   ```
   npm install
   ```
   Isso baixa `typeorm`, `@nestjs/typeorm`, `better-sqlite3` (banco local),
   `pg` (PostgreSQL) e `uuid`. Precisa de Node.js 20+ e internet.

5. **Compile e rode:**
   ```
   npm run build
   npm run start:prod
   ```
   (ou `npm run start:dev` enquanto desenvolve). O backend sobe em
   `http://localhost:3000/api` e cria o arquivo `data/dnlog.db` na primeira vez.

## Testar se está no ar

- Health (não precisa de chave): `http://localhost:3000/api/health`
- Demais endpoints exigem o header `x-api-key: <sua API_KEY>` (se configurada).

## 🔒 Testar a LEITURA dos pedidos do SAP real (somente leitura)

Nesta fase, o DNLog **só consulta** o SAP — nunca escreve (não cria nota nem
pedido). A trava está garantida no código (`SAP_READ_ONLY=true`).

Passos:
1. No `.env`, confirme:
   - `USE_MOCK=false`
   - `SAP_READ_ONLY=true`  ← **mantenha assim durante os testes**
2. Em `SAP_PASSWORD=`, **cole a mesma senha que está no `.env` do BI_DNSEEDS**
   (variável `SAP_PASSWORD`), **entre aspas**: `SAP_PASSWORD="...senha..."`.
   ⚠️ As aspas são obrigatórias — a senha tem um `#` e, sem aspas, o leitor de
   `.env` corta o valor ali (dá "Invalid login credential"). A URL, CompanyDB e
   usuário já vêm preenchidos com as coordenadas do BI (provadas em produção).
3. Rode `npm run build` e `npm run start:prod`.
4. Abra `http://localhost:3000/api/health` — deve mostrar
   `"modo":"sap_real"` e `"somente_leitura":true`.
5. Abra `http://localhost:3000/api/pedidos` — deve listar os pedidos de venda
   em aberto reais do SAP (com `codigo`, `descricao`, `saldo` em cada item).
6. Abra o `dnlog-app.html`: o badge no canto deve dizer
   **"✓ API SAP conectada · N pedidos · 🔒 só leitura"** e as telas (Pedidos,
   Nova OE etc.) mostram os pedidos reais.

> Se faturar uma OE com a trava ligada, o app marca como faturada **só no
> DNLog** (banco próprio) e avisa "SAP em somente leitura — nada gravado no
> ERP". Nenhuma Delivery Note é criada no SAP. Só libere escrita
> (`SAP_READ_ONLY=false`) depois que tudo estiver validado.

Se a leitura der erro, o `/api/pedidos` retorna a mensagem exata do SAP
(ex.: campo inexistente) — copie e me mande para ajustar a consulta.

## Endpoints das Ordens de Embarque (banco)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/oe` | Lista todas as OEs salvas no banco |
| GET | `/api/oe/:id` | Uma OE específica |
| POST | `/api/oe` | Cria/atualiza uma OE |
| POST | `/api/oe/sync` | Salva um lote de OEs (o app usa para sincronizar) |
| PUT | `/api/oe/:id` | Atualiza uma OE |
| DELETE | `/api/oe/:id` | Remove uma OE |
| POST | `/api/oe/faturar` | Cria a Delivery Note no SAP e vincula à OE (campo `oe_id`) |

O frontend (`dnlog-app.html`) sincroniza sozinho: ao abrir, puxa as OEs do
banco; ao criar/editar/faturar, envia de volta. Se o backend estiver offline,
ele continua só no localStorage (modo standalone) sem quebrar.

## Usar PostgreSQL em produção (SkyOne)

No `.env`: `DB_TYPE=postgres` e preencha `DB_HOST`, `DB_PORT`, `DB_USERNAME`,
`DB_PASSWORD`, `DB_NAME`. As tabelas são criadas automaticamente na primeira
subida (`DB_SYNCHRONIZE=true`). Em produção estável, troque para migrations.

## Recompilar depois de mudar o código (`src/`)

```
npm run build      # gera o dist/ atualizado
npm run start:prod
```

Se mudou de máquina ou o `node_modules` sumiu, rode `npm install` (precisa de
Node.js 20+). O `node_modules.zip` é só um atalho para não reinstalar.

---
*Backend validado em 08/06/2026: compila limpo e os endpoints (health, auth por
API key, CORS, faturamento multi-cliente) funcionam em modo mock.*
