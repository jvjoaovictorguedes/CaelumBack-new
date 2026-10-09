# Consultar a produção para reconstruir a Wiki

O levantamento editorial deve usar o catálogo de produção. Dados locais servem apenas para validar o código, não para definir monstros, valores ou histórias do jogo oficial.

## Conexão direta

Configure `DATABASE_URL` nos segredos do ambiente Codex com a URL pública de PostgreSQL do serviço de banco do Railway (`DATABASE_PUBLIC_URL`). Não use a URL HTTP do backend e não envie a senha em chat. O host TCP público do banco precisa estar acessível pelo ambiente. URLs `*.railway.internal` só funcionam dentro da rede Railway.

## Exportação pelo backend de produção

Depois do deploy, no Console do serviço **CaelumBack-new de produção**, execute:

```bash
npm run wiki:export -- --production
```

O comando exige `CAELUM_RELEASE_ENV=production`, abre uma transaction `REPEATABLE READ`, impõe `READ ONLY` e timeout de consulta. Salva o catálogo em `/tmp/caelum-wiki-producao.json` e mostra somente contagens. Nenhum registro do banco é alterado.

Para visualizar o arquivo no Console:

```bash
cat /tmp/caelum-wiki-producao.json
```

Se tiver Railway CLI autenticada na sua máquina, selecione o projeto/ambiente de produção e salve diretamente um arquivo local:

```bash
railway ssh --service CaelumBack-new -- node scripts/export-wiki-catalog.js --production --stdout > caelum-wiki-producao.json
```

O JSON pode ser anexado à conversa para análise. Não exporta Users, Characters, inventários, auditorias, tokens nem configurações de conexão. Os dados coletados são apenas os catálogos explicitamente permitidos em `scripts/export-wiki-catalog.js`; tabelas opcionais ausentes são indicadas no arquivo. Há limite de 20.000 registros por catálogo, com falha explícita em vez de truncamento silencioso.

O exemplo da CLI usa o nome do serviço; ajuste se tiver sido renomeado. `/tmp` é temporário e pode ser perdido após outro deploy. A disponibilidade do arquivo não substitui a regra de descoberta: a nova API da Wiki deverá verificar o personagem autenticado e revelar somente criaturas com primeira derrota registrada, conforme escolha do usuário.

Esta etapa prepara a coleta. Não publica artigos nem altera a fonte, a interface da Wiki ou suas regras de descoberta.
