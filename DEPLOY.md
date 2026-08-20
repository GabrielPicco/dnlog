# Deploy do DNLog — Render + Supabase

Arquitetura: **um** web service no Render (NestJS que serve o app **e** a API,
mantendo uma sessão SAP e o cache em memória) + banco **Postgres no Supabase**.
O SAP é **somente leitura** (hardcoded no código).

Os segredos (senha do SAP, banco, JWT) **nunca** ficam no repositório — são
preenchidos no painel do Render.

---

## 1. Subir o código pro GitHub (repositório PRIVADO)

O `.gitignore` já protege `.env`, `node_modules`, banco local e `public/index.html`.

```bash
cd "07.2 DNLOG WEB APP"
# crie um repo PRIVADO vazio no GitHub (ex.: dnseeds/dnlog) e então:
git remote add origin https://github.com/<sua-org>/dnlog.git
git push -u origin main
```

## 2. Banco no Supabase (projeto novo OU reaproveitar um existente)

Pode **reaproveitar** um projeto Supabase que já existe (ex.: o do QC) — o DNLog
fica num **schema próprio (`dnlog`)**, isolado das outras tabelas. Ou criar um
projeto novo, se o plano free permitir.

1. Se novo: supabase.com → New project (nome `dnlog`). Guarde a **Database Password**.
   Se reaproveitar: use a senha do banco do projeto existente.
2. **Crie o schema** do DNLog — Supabase → **SQL Editor** → rode:
   ```sql
   create schema if not exists dnlog;
   ```
3. Project Settings → **Database** → **Connection string** → aba **"Session pooler"**
   (é IPv4, funciona com o Render). Anote:
   - **Host**: `aws-0-<região>.pooler.supabase.com`
   - **Port**: `5432`
   - **User**: `postgres.<project-ref>`
   - **Database**: `postgres`
   - **Password**: a que você definiu no passo 1

   > Não use a "Direct connection" (`db.<ref>.supabase.co`): ela é IPv6 e o Render
   > pode não alcançar. O **Session pooler** resolve isso.

## 3. Criar o serviço no Render (via Blueprint)

1. render.com → **New** → **Blueprint** → conecte o repositório do passo 1.
   O Render lê o `render.yaml` e cria o serviço `dnlog`.
2. Ele vai pedir as variáveis marcadas como secretas. Preencha:

   | Variável | Valor |
   |---|---|
   | `SAP_PASSWORD` | a senha do usuário `int_dnseeds` (a mesma do BI) |
   | `JWT_SECRET` | gere um: `openssl rand -base64 48` |
   | `DB_HOST` | Host do Supabase (session pooler) |
   | `DB_PORT` | `5432` |
   | `DB_USERNAME` | `postgres.<project-ref>` |
   | `DB_PASSWORD` | senha do banco Supabase |
   | `DB_NAME` | `postgres` |
   | `CORS_ORIGIN` | deixe em branco por ora; preencha no passo 5 |

3. **Create** / **Apply**. O Render roda `npm install && npm run build` (o
   `postbuild` copia o app pra `public/index.html`) e sobe com `npm run start:prod`.
4. Anote a URL gerada, ex.: `https://dnlog.onrender.com`.

## 4. Autorizar a URL no Google OAuth

Console do Google Cloud → projeto **DNLog** → **Credenciais** → o OAuth client
`920998476809-...` → **Origens JavaScript autorizadas** → adicionar a URL do Render
(ex.: `https://dnlog.onrender.com`, sem barra no fim) → Salvar. (Pode levar alguns
minutos pra propagar.)

## 5. Fechar o CORS (opcional, recomendado)

No Render → serviço `dnlog` → Environment → `CORS_ORIGIN` = a URL do Render
(ex.: `https://dnlog.onrender.com`) → salvar (reinicia sozinho). Como o app e a API
ficam na mesma origem, isso é reforço de segurança.

## 6. Primeiro acesso

Abra a URL do Render. Entre com **gabriel@dnseeds.com.br** (é o `ADMIN_EMAIL`,
entra já como GESTOR aprovado). Os demais entram como PENDENTE até você aprovar
na tela **Usuários**. O `DB_SYNCHRONIZE=true` cria as tabelas no 1º deploy.

---

## Observações
- **Somente leitura garantido**: o backend bloqueia qualquer escrita no SAP no
  código (trava de rede + trava de método). Nenhuma variável de ambiente libera.
- **Plano free do Render** hiberna após ~15 min sem uso → o 1º acesso depois disso
  demora ~30s pra "acordar" (e re-loga no SAP uma vez). Para uso real, subir de
  plano evita a hibernação.
- **Sessões SAP**: por ser um processo único e persistente, usa **uma** sessão
  (compartilhada com o BI no pool). Ok para o teste.
- **A confirmar com a SkyOne**: se o Service Layer tem allowlist de IP, liberar o
  IP de saída do Render.
- Depois de estável, trocar `DB_SYNCHRONIZE` para `false` e usar migrations.
