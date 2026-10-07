# Fase 2 — núcleo de ações incremental

`combatActionEngine.resolveAction({ actor, target, action, battleContext, state })` resolve a ação sem Express, Socket.IO, modelos de matches, timers ou recompensas. Retorna outcome, referências dos atores, escudos/buffs resultantes e um evento de domínio COMBAT_ACTION_RESOLVED. O evento é informação para adaptadores, não uma emissão de rede. Os objetos de ator conservam a semântica mutável atual.

A implementação de aplicarAcao foi extraída literalmente. `duelEngine.aplicarAcao` permanece fachada que traduz os nomes antigos e devolve apenas o outcome antigo, sem campos extras no protocolo. Duelo assíncrono, PvP live, ranked, grupo e bosses que já usavam esse adaptador passam pelo núcleo. PvE usa os helpers de fórmula do mesmo módulo; preserva validação, bloqueio de ação, cooldown e lifecycle próprios. Não se uniformizou a diferença caracterizada de Silêncio.

Status de início/fim, carregamento assíncrono de configurações e cooldown continuam nos adaptadores existentes. Esta é uma migração incremental, não uma alegação de equivalência completa entre todos os modos. Nenhuma fórmula foi copiada ou recalculada em paralelo.

Validação: uma execução de 36 testes de caracterização/balanceamento/fluxo ranked/grupo e outra de 21 testes de gatilhos/lifesteal/Silêncio/caracterização passaram; zero falhas e ignorados. A suíte global será repetida após as próximas extrações.
