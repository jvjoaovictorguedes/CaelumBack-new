// Seleção de habilidade de boss por cooldown/prioridade/peso — extraído
// de worldBossRuntimeService.js (Ameaça Mundial V2 §6.3) pra ser
// reaproveitado por qualquer boss com catálogo de habilidades ligado a
// Power (hoje: World Boss e Boss da Guilda). Puro por design: só
// trabalha com o array de habilidades + o objeto de cooldowns que quem
// chama já carregou — nunca acessa banco/model daqui, então serve
// tanto pro relógio persistido do World Boss (boss_action_seq) quanto
// pro estado em memória do Boss da Guilda (rodada).
//
// `ability` esperado: { id_ability, power_snapshot, peso_uso,
// prioridade, cooldown_override, fases_permitidas? }. fases_permitidas
// é opcional — quem não usa fases (Boss da Guilda) simplesmente nunca
// passa esse campo, e o filtro de fase abaixo nem entra em jogo.
const { custoManaEfetivo } = require("./combatFormulas");

function custoManaPadrao(ability) {
  return custoManaEfetivo(ability.power_snapshot, 1);
}

function cooldownDaHabilidade(ability) {
  return ability.cooldown_override ?? ability.power_snapshot?.cooldown ?? 0;
}

function habilidadeDisponivel(cooldowns, ability, sequenciaDaAcao) {
  const threshold = cooldowns?.[String(ability.id_ability)];
  return !threshold || sequenciaDaAcao >= threshold;
}

// §6.3 passos 2/3 — fases_permitidas (quando presente) guarda id de
// fase; NULL/vazio = elegível em toda fase. custoManaDaHabilidade tem
// como padrão o mesmo custo efetivo do World Boss (combatFormulas.
// custoManaEfetivo) — quem não tem conceito de mana (Boss da Guilda)
// só passa manaAtual: Infinity, que aprova sempre sem precisar
// sobrescrever nada. `sequenciaDaAcao`/`bossActionSeqDaAcao` são o
// mesmo parâmetro (aceita os dois nomes) — cada boss chama com o nome
// que já faz sentido pra ele (ação do boss vs. rodada).
function habilidadesElegiveis(abilities, { faseId, manaAtual, cooldowns, sequenciaDaAcao, bossActionSeqDaAcao, custoManaDaHabilidade = custoManaPadrao }) {
  const seq = sequenciaDaAcao ?? bossActionSeqDaAcao;
  return (abilities || []).filter((ability) => {
    if (!ability.power_snapshot) return false;
    if (Array.isArray(ability.fases_permitidas) && ability.fases_permitidas.length > 0 && !ability.fases_permitidas.includes(faseId)) {
      return false;
    }
    if (!habilidadeDisponivel(cooldowns, ability, seq)) return false;
    if (custoManaDaHabilidade(ability) > manaAtual) return false;
    return true;
  });
}

// §6.3 passo 4 — só concorrem entre si as de MAIOR prioridade elegível;
// o sorteio por peso_uso decide só entre essas, nunca entre todas.
function escolherHabilidade(elegiveis) {
  if (elegiveis.length === 0) return null;
  const maiorPrioridade = Math.max(...elegiveis.map((a) => a.prioridade || 0));
  const candidatas = elegiveis.filter((a) => (a.prioridade || 0) === maiorPrioridade);
  const pesoTotal = candidatas.reduce((soma, a) => soma + Math.max(1, a.peso_uso || 1), 0);
  let alvo = Math.random() * pesoTotal;
  for (const candidata of candidatas) {
    alvo -= Math.max(1, candidata.peso_uso || 1);
    if (alvo < 0) return candidata;
  }
  return candidatas[candidatas.length - 1];
}

module.exports = {
  cooldownDaHabilidade,
  habilidadeDisponivel,
  habilidadesElegiveis,
  escolherHabilidade,
};
