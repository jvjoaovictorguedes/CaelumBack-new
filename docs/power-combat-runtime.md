# Eventos de PowerCombatEffect

As habilidades aprendidas são consultadas uma vez por ação/contexto. Passivas
contam sempre; habilidades ativas precisam estar no loadout. `ativo` e os sete
campos `allow_*` filtram as linhas antes da execução. PvP ao vivo distingue
`PVP_CASUAL`, `RANKED` e `TOURNAMENT`.

Eventos reativos:

- `COMBAT_START`: uma vez, na primeira ação válida ou ataque recebido da sessão.
- `TURN_START`/`TURN_END`: início/fim do próprio turno, inclusive passe e bloqueio.
- `ON_CAST`: habilidade efetivamente usada, depois do pagamento de Mana.
- `ON_HIT`/`ON_CRIT`: golpe acertado; crítico exige um acerto crítico real.
- `ON_DAMAGE_TAKEN`: redução de HP, incluindo DoT; escudo completo não dispara.
- `ON_DODGE`: esquiva real, sem contar erro provocado por cegueira.
- `ON_HEAL`: recuperação efetiva da ação ou regeneração; cura no teto não dispara.
- `ON_KILL`: transição do alvo vivo para derrotado, sem duplicar mortes.

O runtime usa estado serializável na batalha, encontro PvE ou sessão do Boss
Mundial. Não escreve modificadores nos atributos permanentes. Chance é sorteada
por linha/evento; condições são avaliadas por destinatário. Efeitos numéricos
respeitam as seis políticas de reaplicação, agrupadas por chave/grupo/origem.

Duração é contada nos turnos do destinatário. Um efeito de um turno aplicado
antes da própria ação vale nessa ação e na resposta do adversário; aplicado
após a ação ou fora do próprio turno vale até o próximo turno do destinatário.
Sem duração, o modificador dura até encerrar o combate. Regeneração reativa de
Vida/Mana é instantânea, preservando a agregação por grupo usada no motor
anterior. Recuperação reativa não dispara uma cadeia recursiva de `ON_HEAL`.
Atores derrotados não são ressuscitados por reações.

O Admin mantém suporte **parcial** por combinação: ter um evento executado não
significa que qualquer configuração funciona em todos os modos. Limitações:

- `PASSIVE` continua com as limitações anteriores de alvo, condição e duração.
- `ALL_ALLIES` inclui membros presentes em Grupo/Guild Boss; no Boss Mundial,
  os destinatários disponíveis são os da sessão atual, sem consulta global.
- Escudos reutilizam a política de maior valor existente; não implementam as
  seis políticas temporais de modificadores numéricos.
- `DISPEL_BUFF` remove um modificador de Power dissipável; não remove buffs de
  consumível. Configuração opcional `stack_group` restringe a seleção.
- Redução numérica do cooldown ao iniciar uma habilidade está ligada ao PvE;
  os outros modos mantêm o ciclo anterior. `REDUCE_COOLDOWN` atua nos mapas de
  cooldown disponíveis no contexto.
- Limpeza em `TURN_START` do PvE/Boss Mundial ocorre depois da decisão inicial
  de bloqueio da ação; no motor de duelos, ocorre antes dessa decisão.

Validação: `test/powerCombatRuntime.test.js`, integração em
`combatModifierService.test.js`, `combatRegenShieldResistance.test.js` e
`worldBossDiscovery.test.js`, além das regressões de duelos, Grupo e Bosses.
