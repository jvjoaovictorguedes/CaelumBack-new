# Entrega incremental das fases 1–7

Executada após autorização para continuar o plano anexado. Não houve escrita em produção, alteração de schema do jogo ou edição das 419 migrations existentes. Main de origem: backend 38e7eff, frontend 3bd709db.

| Fase | Entrega |
| --- | --- |
| 0 — baseline | Fixtures estabilizadas, RNG controlado apenas nos testes e arquivos serializados no runner que compartilha banco; 1.302 testes verdes antes da extração. |
| 1 — contratos | Constantes reais de evento por domínio; serializers de início/resync, turno/fim, rating e grupo; tipos frontend separados com reexports compatíveis. |
| 2 — ações | combatActionEngine com contrato canônico de entrada, outcome/estado/evento de domínio; duelEngine mantém API antiga; fórmulas PvE reutilizadas. Lifecycle/eligibilidade/cooldown dos modos permanecem incrementais. |
| 3 — economia | Três gastos pelo helper canônico; política ouro/XP/stack/equipamento/payout; baseline de 28 escritas e guard no CI. Transferências P2P preservadas. |
| 4 — realtime | Hooks e handlers por PvP/ranked/torneio/party/guild boss; um transporte autenticado/presença/resync; cleanup por referência e reducers puros. |
| 5 — decomposição | API administrativa de poderes extraída com barrel; listagem, detalhe e evolução/natureza em componentes distintos. Outras áreas permanecem candidatas futuras. |
| 6 — migrations | Histórico imutável, scaffold ordenado, metadata real/dependências, audit no CI e bootstrap descartável com pré-condições legadas explícitas. |
| 7 — frontend | Fixtures dos serializers em JSON/TS com satisfies; testes de contratos/reducers; browser smoke real Next + backend/Socket.IO simulados; gates de CI. |

## Evidência final local

- Backend completo: **1.312 testes passaram, zero falhas, zero ignorados**, 369,7 s, Node 24/PostgreSQL 16, base descartável.
- Contratos/migration policy direcionados: 9 testes passaram; snapshot público foi conferido novamente após limpar evento inexistente encontrado somente em comentário.
- `check:requires`: zero problemas. Auditorias de economia e migrations: passaram.
- Frontend: **17 testes passaram**, zero falhas/ignorados, aproximadamente 0,17 s. TypeScript, lint e build de produção passaram; build com URLs locais reais levou 46,4 s. Lint mantém warnings preexistentes.
- Smoke browser: **1 cenário passou** em aproximadamente 3,8 s, incluindo login real via Server Action, cookie httpOnly, autorização BFF, dashboard, slots vazios/ocupados, turno/fim casual, ranked/rating, resync/rodada de grupo, conexão compartilhada e distinção 403/401. Sem erros JavaScript de página.
- Bootstrap desde banco vazio executado com pré-condições de teste; repetição reportou schema atualizado, sem reaplicar histórico.

CI remoto não foi executado nesta entrega. Workflows usam Node 22/PostgreSQL 16; a matriz local usa Node 24. As fixtures são sintéticas, sem credenciais ou dados de produção.

## Reproduzir contratos entre os dois repositórios

No backend: `node scripts/export-combat-contracts.js ../CaelumFront-new/test/fixtures`. O comando exporta fixtures sintéticas dos serializers, sem consultas de banco. Commite as fixtures nos dois repositórios: o backend testa igualdade com o snapshot, e o frontend confere nomes de eventos e o compilador verifica os payloads com satisfies. Mudanças legítimas de protocolo requerem revisão conjunta, não atualização cega do snapshot.

## Limites deliberados

A migração é incremental. A semântica diferente de Silêncio PvE/duelo foi mantida; lifecycle de status/cooldown continua nos adaptadores. World Boss mantém seu provider e contrato próprio. Não foi introduzido pacote compartilhado entre repositórios, Redis, biblioteca global de estado ou reescrita de todas as telas/controllers. Guard de economia é lexical e não substitui revisão de SQL/updates indiretos.

O histórico exige catálogo das zonas 51–100 cadastrado administrativamente. Fixtures inativas resolvem somente a pré-condição do banco descartável. Um banco novo de produção ainda exige versionar/exportar esse catálogo real; detalhes em migration-policy.md. Prefixos futuros do legado foram preservados com relógio lógico e data real separada, evitando reordenação/reaplicação.

## Integração com dev

O merge preserva o hotfix existente na dev para a migration
`20270205010000-seed-monster-active-abilities-zonas-51-100.js`: monstros
ausentes são ignorados com aviso, em vez de impedir o boot. O hash desse
único arquivo no baseline foi reconciliado com a versão já publicada na
dev; o arquivo foi preservado integralmente. Os demais hashes históricos
permanecem inalterados. A limitação de cadastro mencionada acima passa a
ser de conteúdo: sem os monstros cadastrados, suas habilidades não são
criadas, mas a migration pode terminar. O bootstrap de testes mantém as
fixtures inativas para exercitar também a criação das habilidades.
