# Caelum — Backend

API do RPG Caelum. Node.js + Express + Sequelize (PostgreSQL) + Socket.IO
pra tudo que é tempo real (combate em grupo, PvP, chat de guilda, boss).

## Requisitos

- Node.js 22+
- PostgreSQL 16 (local ou remoto)

## Setup local

```bash
npm install

# crie um banco local e configure as variáveis abaixo (ver seção
# "Variáveis de ambiente"), depois:
npm run migrate   # cria as tabelas
npm run seed      # popula dados base (raças, classes, itens, zonas...)

# ou os dois de uma vez:
npm run setup:local

npm run dev        # nodemon, reinicia sozinho a cada alteração
```

O servidor sobe em `http://localhost:3001` por padrão (`PORT`).

## Variáveis de ambiente

Crie um `.env` na raiz do projeto (não versionado). Nenhuma tem valor
"de exemplo" comitado — configure direto no seu `.env` local ou nas
variáveis de ambiente do serviço de deploy.

### Banco de dados

Duas formas de configurar, escolha uma:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` (ou `POSTGRES_URL`) | Se não usar as `DB_*` abaixo | URL completa `postgres://usuario:senha@host:porta/banco`. É o que o Railway (e provedores parecidos) já fornece pronto. |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Se não usar `DATABASE_URL` | Config local, campo a campo. Também aceita `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` (padrão do `libpq`) como alternativa. |
| `DB_SSL` | Não | `"true"` pra exigir SSL na conexão (necessário em bancos gerenciados na nuvem). |

### Autenticação

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `JWT_SECRET` | **Sim** | Segredo usado pra assinar os tokens de sessão. |
| `JWT_EXPIRES_IN` | Não (default `6h`) | Validade do token em login normal. |
| `JWT_EXPIRES_IN_REMEMBER_ME` | Não (default `7d`) | Validade quando o usuário marca "lembrar-me". |
| `GOOGLE_CLIENT_ID` | Só se for usar "Entrar com Google" | Client ID OAuth 2.0 do Google Cloud Console. Sem ela, login com Google responde erro de configuração (o botão continua aparecendo no front, então configure os dois lados juntos). |

### E-mail (recuperação de senha)

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `RESEND_API_KEY` | Só em produção | Chave da API do [Resend](https://resend.com). Sem ela, o link de "esqueci minha senha" só é logado no console do servidor — útil pra testar o fluxo localmente sem provedor configurado, mas em produção isso significa que ninguém recebe o e-mail de verdade. |
| `RESEND_FROM` | Junto com a de cima | Remetente, ex. `Caelum <noreply@seudominio.com>`. |

### Rede / CORS

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `CORS_ORIGIN` | **Sim em produção** | Origens do frontend permitidas, separadas por vírgula (ex. `https://caelum.seudominio.com`). Em produção (`NODE_ENV=production`) o servidor recusa subir sem isso — nunca cai em `"*"` sozinho. Fora de produção, se ausente, aceita qualquer origem (só pra não travar quem está configurando o ambiente local). |
| `FRONTEND_URL` | Não | Usada pra montar links absolutos (ex. no e-mail de reset de senha). |
| `PORT` | Não (default `3001`) | Porta HTTP do servidor. |

### Outras

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `RANKED_TIMEZONE` | Não (default `America/Sao_Paulo`) | Fuso horário usado pro reset diário de tentativas do ranqueado. |
| `NODE_ENV` | Não | `production` liga as validações de produção (CORS obrigatório, etc.). `test` é usado automaticamente pelos testes. |

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe com `nodemon` (reinicia a cada alteração). |
| `npm start` | Roda as migrations e sobe o servidor — usado em produção. |
| `npm run migrate` | Aplica as migrations pendentes (`sequelize-cli db:migrate`). |
| `npm run seed` | Roda todos os seeders (`sequelize-cli db:seed:all`). |
| `npm run setup:local` | `migrate` + `seed` de uma vez — setup inicial completo. |
| `npm test` | Roda a suíte de testes (`node --test`). Usa o banco apontado pelas variáveis `DB_*`/`DATABASE_URL` no momento — **nunca rode contra o banco de desenvolvimento com dados reais**, os testes escrevem e limpam dados. Prefira um banco descartável (`createdb nome_temporario`) e derrube depois. |
| `npm run check:requires` | Confere se todo `require()` bate com a caixa exata do nome do arquivo (Linux é case-sensitive; evita bug que só aparece em produção). |

Existe também CI (GitHub Actions, `.github/workflows/ci.yml`): a cada
push/PR na `main`, sobe um Postgres novo, roda `migrate` e `test`
automaticamente.

## Arquitetura

```
src/
  app.js          — monta o Express, middlewares e todas as rotas
  config/         — conexão com o banco, config do sequelize-cli, constantes de balanceamento por sistema
  models/         — modelos Sequelize (109 hoje) — 1 arquivo por tabela
  controllers/    — lógica de cada rota HTTP
  services/       — regras de negócio reutilizadas por controllers/sockets (combate, forja, ranking, guildas...)
  routes/         — define os endpoints e liga rota → controller
  socket/         — canais Socket.IO (combate em grupo, PvP ao vivo, chat/boss de guilda, torneio)
  middlewares/    — autenticação, validação, etc.
  migrations/     — histórico de mudanças no schema (nunca editar uma já aplicada — sempre criar uma nova)
  seeders/        — dados base (raças, classes, itens, monstros, zonas...)
test/             — testes (node --test), batem no banco configurado no momento
```

### Domínios principais da API (`/api/...`)

- **Conta**: `users` (cadastro, login, login com Google, recuperação de senha)
- **Personagem**: `characters`, `classes`, `races`, `attributes`, `character-abilities`, `race-abilities`, `class-abilities`
- **Equipamento/Itens**: `items`, `character-inventory`, `character-equipment`, `equipment`, `inventory`, `weapon-properties`, `armor-properties`, `consumable-properties`, `crafting` (Forja)
- **Combate**: `combat` (PvE solo), `pvp`, socket `partySocket`/`pvpLiveSocket` (PvE em grupo e PvP ao vivo)
- **Mundo**: `adventure`, `bestiary`, `world`, `expeditions`, `evolutions`
- **Social**: `guilds`, `messages`, `adventure-guild` (contratos/missões da guilda)
- **Economia**: `shop`, `market`
- **Competitivo**: `ranking`
- **Admin**: `admin/pvp/tournaments`, `admin/items`, `admin/audit`, `admin/admins`
- **Outros**: `patch-notes`, `onboarding`

## Deploy

Comentários no código (`src/config/database.js`) indicam Railway como
alvo de deploy — `DATABASE_URL` é fornecida automaticamente por lá.
`npm start` já roda as migrations antes de subir o servidor, então o
deploy não precisa de passo manual extra além de configurar as
variáveis de ambiente de produção (principalmente `JWT_SECRET`,
`CORS_ORIGIN` e `DATABASE_URL`).
