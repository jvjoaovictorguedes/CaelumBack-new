# Fase 0 — baseline arquitetural do Caelum

Referência observada em 07/10/2026: backend `38e7eff`, frontend `3bd709db`, ambos derivados de `main`. O plano anexado é uma proposta de consolidação; o comportamento efetivo do código é a referência para esta fase.

Esta entrega documenta e caracteriza o estado atual. Não cria um Combat Action Core, catálogo de constantes ou serializers novos. Não modifica gameplay, fórmulas, RNG em produção, balanceamento, recompensas, rotas, eventos, schema ou migrations. A próxima fase depende de revisar este baseline e resolver os gates pendentes.

- [Decisão e limites da consolidação](adr-0001-consolidacao-incremental.md)
- [Matriz de capacidades por modo](combat-capabilities.md)
- [Contratos HTTP e Socket.IO](combat-contracts.md)
- [Resultados, falhas anteriores e comandos](validation.md)

## Inventário técnico

Contagem local dos arquivos de código, sem `node_modules`/artefatos gerados, antes de adicionar a documentação. As contagens são evidência do tamanho atual, não gates de CI.

| Área | Backend | Frontend |
| --- | ---: | ---: |
| Models | 197 | — |
| Services | 201 | — |
| Controllers | 92 | — |
| Routes | 81 | — |
| Sockets | 11 | — |
| Migrations | 419 | — |
| Arquivos JS/TS/TSX em src | 1.058 | 319 |

Arquivos que concentram responsabilidades: `combatController.js` (~102 KB), `characterController.js` (~71 KB), `PvpSocketContext.tsx` (~39 KB), `lib/api/admin.ts` (~183 KB). Serão extraídos por responsabilidade em fases próprias, não movidos nesta entrega.

## Rede de segurança

`test/combatArchitectureCharacterization.test.js` fixa resultados numéricos e efeitos observáveis de ataque básico, poder, silêncio e consumível em dois caminhos reais: `combatController.executarTurno` (PvE solo, com Postgres) e `duelEngine.resolverTurnoComStatus` (motor usado pelos duelos). Também caracteriza o payload público de início/resync casual usando o serializer já existente.

Os testes usam RNG fixo somente durante cada chamada no processo de teste, restaurado em `finally`. O teste HTTP mede a ação do jogador separadamente do contra-ataque, conserva o contrato e verifica consumo de inventário e persistência. Não recalcula o resultado esperado chamando a mesma fórmula. Fixtures de personagens, usuários, poderes e itens são removidas ao terminar.

Os helpers históricos criam também um catálogo de raça/classe para testes. Isso não é um seed de produção. Os testes desta fase não podem ser apontados para produção. Sem Postgres, testes de integração são marcados como skip; esse resultado não comprova a Fase 0.

A matriz distingue disponibilidade no código de evidência automatizada. A caracterização de dois caminhos não é uma certificação de todos os modos nem uma prova de funcionamento em produção.
