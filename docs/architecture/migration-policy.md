# Fase 6 — política de migrations

As 419 migrations históricas permanecem byte a byte iguais. migration-legacy.json registra seus hashes; `npm run audit:migrations` falha se forem alteradas/removidas. Correções de produção devem usar novas migrations, nunca editar histórico aplicado ou usar sync({ alter: true }).

## Novos arquivos e datas futuras do legado

`npm run migration:new -- descricao-kebab [arquivo-dependencia.js ...]` cria arquivo e entrada de manifest com createdAt real UTC e dependências explícitas. Prefixos são únicos e maiores que o último arquivo existente, para preservar a ordem lexical do Sequelize.

Há uma incompatibilidade no plano: data real atual (2026-10-07) ordenaria antes do histórico já nomeado até 2027-02-06. Renomear histórico pode reaplicar schema. Por isso, durante esse intervalo, o prefixo é um relógio lógico (último prefixo + um segundo); a data real fica separada no manifest. Quando o relógio atual superar o legado, volta-se ao timestamp real no filename. Essa escolha é explícita, testada e preserva dependências. Revisar dependências e reversibilidade antes de preencher up/down; scaffolds novos falham até serem implementados.

## Banco vazio e catálogo administrativo não versionado

O teste inicial do banco vazio aplicou o histórico até `20270204010000`, mas falhou na seguinte: exige 40 monstros das zonas 51–100 criados pelo Admin, ausentes do histórico do repositório. A falha e a transação atômica foram preservadas; não se inventaram stats/drops de produção para contornar a dependência.

`npm run migrate:test` é bootstrap exclusivamente de banco descartável: exige NODE_ENV=test, host local e nome *_test/*_ci/caelum_architecture_*. Aplica migrations até a pré-condição, cria apenas fixtures inativas dos 40 nomes se ausentes, aplica o restante e repete a execução. O CI usa esse caminho explícito. Não altera registros existentes e não é um seed jogável nem comando de produção.

Validação local: banco novo `caelum_architecture_fresh` alcançou todas as 419 migrations com as pré-condições de teste; segunda execução sem migrations pendentes. A aplicação automática em um banco de produção vazio continua exigindo exportar/versionar o catálogo administrativo real. O npm start/migrate de produção não foi modificado e nenhum banco remoto foi acessado.
