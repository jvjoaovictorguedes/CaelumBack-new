# ADR 0001 — consolidar por adaptação, preservando o comportamento

Status: adotado para a Fase 0. Arquitetura futura: proposta, ainda não implementada.

## Contexto

O projeto compartilha fórmulas e serviços, mas tem orquestração distinta para PvE, duelo, Party e bosses. O frontend concentra vários protocolos em `PvpSocketContext`. A extração transversal de todas essas responsabilidades aumentaria o risco de mudar regras específicas dos modos.

## Decisão

1. Backend permanece autoridade sobre regras, RNG, recursos, persistência e estado de batalha. Frontend apresenta resultados e solicita ações.
2. Executar fases isoladas. Antes de extrair regras, registrar e testar comportamento atual; diferenças entre modos não são corrigidas implicitamente pela refatoração.
3. Preservar nomes de rotas/eventos e formatos públicos. Uma mudança de payload deve coordenar emissão/serializer backend, tipo frontend e teste de contrato na mesma entrega.
4. Um futuro core resolve a ação; matchmaking, salas, turnos, recompensas e persistência continuam nos orquestradores. Não passar `req`, `res` ou `socket` ao core.
5. Reutilizar fórmulas, status, cooldowns, buffs e resolvers existentes; remover legado somente depois de caracterização e migração dos consumidores.
6. Mutações econômicas compostas continuam transacionais. Reutilizar serviços canônicos existentes de ouro, inventário, equipamento, XP e recompensas; avaliar idempotência conforme retry/concorrência reais. A auditoria e migração desses fluxos pertencem à Fase 3.
7. Não renomear/editar migrations já aplicáveis. Produção continua migrando explicitamente; não substituir esse fluxo por `sync({alter:true})`.
8. Manter a conexão realtime compartilhada e cleanup por referência de handler quando os domínios forem extraídos. Redis e runtime distribuído só entram com necessidade operacional demonstrada.

## Consequências

Nesta etapa não há alteração em `src`, migrations, dependencies ou contratos externos. Testes observam resultados públicos e estado persistido. O gate completo do backend deve ficar verde antes de começar a Fase 1; falhas já existentes são registradas e não ocultadas ou corrigidas silenciosamente fora do escopo.

O guia original sugere uma evolução de contratos, economia e core. Isso não significa que todas essas abstrações já existem ou estejam universalmente conectadas hoje. A matriz e o catálogo descrevem a implementação encontrada.
