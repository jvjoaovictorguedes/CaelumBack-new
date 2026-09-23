// Cooldown real de habilidades (§33-36 da Especificação Consolidada
// Poder/Status/Cooldown/Balanceamento).
//
// Semântica exata (testada explicitamente pra não dar off-by-one, ver
// §33 e os testes do §77): `Power.cooldown = 3` bloqueia EXATAMENTE os
// 3 PRÓXIMOS turnos daquele ator depois do turno em que foi usada — o
// próprio turno de uso não conta como um dos três. Isso só funciona se
// o cooldown recém-aplicado NÃO for decrementado no fim do mesmo turno
// em que entrou; só nos turnos seguintes.
//
// Estado vive só no combate (encontro_pve/partyBattleState), nunca em
// Character como regra global (§34) — acaba a luta, os cooldowns somem.
// Formato: `cooldowns['power:<id>'] = turnosRestantes`.
function chaveDoPoder(powerId) {
  return `power:${powerId}`;
}

function podeUsar(cooldowns, powerId) {
  return !(cooldowns[chaveDoPoder(powerId)] > 0);
}

// Só chamar depois que a ação JÁ foi validada e consumida como ação
// válida (§35) — uma tentativa rejeitada por Mana/Silence/cooldown não
// deve iniciar cooldown nenhum. `cooldown` <= 0/null nunca entra no mapa
// (habilidade sem cooldown configurado nunca fica bloqueada).
function iniciarCooldown(cooldowns, powerId, cooldownConfigurado) {
  if (!cooldownConfigurado || cooldownConfigurado <= 0) return cooldowns;
  return { ...cooldowns, [chaveDoPoder(powerId)]: cooldownConfigurado };
}

// Fim do turno do ator (§36): decrementa todo cooldown ativo em 1,
// EXCETO os que acabaram de ser aplicados NESTE MESMO turno (ver
// comentário no topo do arquivo — é isso que faz cooldown 3 bloquear
// exatamente 3 turnos, não 2). `chavesAplicadasNesteTurno` é o Set
// devolvido por iniciarCooldown-no-turno-atual — quem chama monta esse
// Set conforme usa poderes ao longo do próprio turno.
function decrementarCooldowns(cooldowns, chavesAplicadasNesteTurno = new Set()) {
  const resultado = {};
  for (const [chave, restante] of Object.entries(cooldowns)) {
    if (chavesAplicadasNesteTurno.has(chave)) {
      resultado[chave] = restante;
      continue;
    }
    const novoRestante = restante - 1;
    if (novoRestante > 0) resultado[chave] = novoRestante;
  }
  return resultado;
}

function turnosRestantes(cooldowns, powerId) {
  return Math.max(0, cooldowns[chaveDoPoder(powerId)] || 0);
}

module.exports = {
  chaveDoPoder,
  podeUsar,
  iniciarCooldown,
  decrementarCooldowns,
  turnosRestantes,
};
