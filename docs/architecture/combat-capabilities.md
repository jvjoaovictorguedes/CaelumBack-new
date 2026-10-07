# Capacidades de combate — baseline observado

Legenda: **Sim** = caminho conectado no código; **Parcial** = suporte específico descrito nas notas; **Não** = indisponível nesse caminho. A presença na matriz não equivale a cobertura E2E. Colunas PvP representam casual ao vivo; diferenças do simulador assíncrono estão abaixo.

| Capacidade | PvE solo | Party | PvP casual | Ranked | Guild Boss | World Boss |
| --- | --- | --- | --- | --- | --- | --- |
| Ataque básico | Sim | Sim | Sim | Sim | Sim | Sim |
| Poder ativo | Sim | Sim | Sim | Sim | Sim | Sim |
| Consumível em combate | Sim | Sim | Sim | Não | Não | Não |
| Crítico | Sim | Sim | Sim | Sim | Sim | Sim |
| Esquiva/acerto | Sim | Sim | Sim | Sim | Parcial | Sim |
| Status de poder/arma | Sim | Sim | Sim | Sim | Parcial | Sim |
| Buff de consumível | Sim | Sim | Sim | Não | Não | Não |
| PowerCombatEffect passivo/reativo | Sim | Sim | Sim | Sim | Sim | Sim |
| Cooldown de poder | Sim | Sim | Sim | Sim | Sim | Sim |
| Regen periódica do jogador | Sim | Sim | Sim | Sim | Parcial | Parcial |
| Lifesteal do jogador | Sim | Sim | Sim | Sim | Sim | Sim |
| Proc de status de arma | Sim | Sim | Sim | Sim | Não | Sim |

## Evidências e restrições

- **PvE**: `src/controllers/combatController.js` orquestra uma ação, contra-ataque e fim de turno. Usa `combatFormulas`, `consumableEffectService`, `combatEffectResolver`, `weaponEffectResolver`, `combatBuffService`, `cooldownService`, `combatModifierService` e `powerCombatRuntime`.
- **Party**: `src/socket/partySocket.js` chama `duelEngine.resolverTurnoComStatus`; valida e consome itens antes de executar a ação. IA/turnos/recompensas e penalidade de diferença de nível permanecem no modo.
- **Casual**: `src/socket/pvpLiveSocket.js` usa o mesmo resolvedor, mas cuida de identificação, desafios, ações, timers, reconexão e finalização. Consumíveis são carregados/validados pelo socket.
- **Ranked**: `src/socket/rankedLiveSocket.js` inicia combate humano versus defensor controlado por IA e usa o motor do duelo casual. A lista pública de consumíveis é vazia e o servidor rejeita ações de item. Fila antiga é depreciada; não presumir matchmaking humano versus humano.
- **Guild Boss**: `src/socket/guildBossSocket.js` usa `duelEngine.aplicarAcao` diretamente, não o resolvedor completo de status de poder/arma. O alvo é montado com agilidade zero. Controle/status do boss e habilidades hostis são próprios do modo, sem paridade automática com o duelo. PowerCombatEffect reativo está conectado; isso não implica execução completa de DoT, buff Self e regen periódica de `resolverTurnoComStatus` para aliados. Consumíveis e procs de arma não passam por esse adaptador.
- **World Boss**: `src/services/worldBossCombatService.js` usa `aplicarAcao`, mas resolve explicitamente controle, DoT, status de poder e procs de arma. `worldBossRuntimeService` executa as ações/fases do boss e aplica resistências; estado global não é um duelo simétrico. Regen via gatilhos existe; a sequência de regen periódica do resolvedor de duelo não está inteiramente conectada para o jogador. O boss tem regras próprias de mana e hard rules contra cura/regen de HP/escudo.
- **Casual assíncrono**: `pvpController.simularDuelo` também usa o resolvedor de status e efeitos de arma. IA escolhe ataque/poder e cooldowns; não há interface manual de consumível nesse simulador.

Comentários antigos no cabeçalho de `worldBossCombatService.js` afirmam imunidade a status e ausência de contra-ataque; trechos executáveis atuais e o runtime de bosses contradizem essa fotografia histórica. A matriz usa o código atual; os comentários não foram alterados nesta fase.

## Diferenças congeladas pelos testes novos

| Cenário determinístico | PvE solo | Duelo casual (resolvedor) |
| --- | --- | --- |
| Ataque sem arma, nível 1/Força 10, RNG 0,9 | 15 de dano, mana 50 | 15 de dano, mana 50 |
| Poder base 20 + Força × 0,5, custo 5 | 27 de dano, mana 45, cooldown novo 2 | 27 de dano, mana 45; cooldown pertence ao chamador |
| Poder durante Silêncio com duração 3 | HTTP 403; turno e mana não persistem consumo | turno bloqueado, duração passa a 2, mana inalterada |
| Consumível moderno 25% HP + legado 90%, HP 50/90 | HP após ação 73; consome 1 unidade | HP 73; consumo pertence ao chamador |

Não uniformizar essas diferenças na extração futura sem uma tarefa de mudança de regra aprovada.

## Cobertura existente a manter

| Área | Testes de referência |
| --- | --- |
| Fórmulas, crítico/esquiva | `combatBalance`, `combatPrecisaoCritico`, `combatDificuldadePorNivel` |
| Poder/status e controle | `combatPowerService`, `statusEffectService`, `statusEffectEvolucao`, `duelEngineSilenceBlock`, `pvpAsyncStatusEffects` |
| Itens, buffs, regen/escudo | `consumableHealMana`, `combatBuff`, `combatBuffStacking`, `combatRegenShieldResistance` |
| Modificadores/procs/lifesteal | `combatModifierService`, `combatModifierWiring`, `reactiveTriggers`, `powerCombatRuntime`, `duelEngineLifesteal` |
| Party e bosses | `partyBattleService`, `guildBossCooldown`, `worldBossDiscovery`, `worldBossV2Fundacao`, `worldBossAbilityHardRule` |
| Ranked | `ranked*` e testes de IA/tiers/temporadas/partidas órfãs |

Os nomes nesta tabela referem-se aos arquivos `.test.js` em `test/`; ela é um mapa de evidências existentes, não a declaração de que todos os fluxos Socket.IO foram exercitados ponta a ponta.
