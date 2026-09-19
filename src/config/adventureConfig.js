// Configuração central do Modo Aventura (§24 da spec) — nada de
// probabilidade/multiplicador espalhado pelo controller.

// §11 — o Raro precisa render mais que os comuns da mesma região.
// Aplicado em cima da MESMA fórmula de XP/ouro que a Aventura já usava
// (ver XP/OURO abaixo) — nunca uma escala nova e desconectada do
// balanceamento existente.
const MULTIPLICADOR_RARO_XP = 3;
const MULTIPLICADOR_RARO_OURO = 3;

// §10 — perfil de combate do Raro por padrão, quando o
// AdventureMonster.multiplicador_* específico da criatura não cobrir
// isso sozinho (fica disponível pro seed usar como ponto de partida,
// não é aplicado automaticamente por cima do perfil do monstro — cada
// Raro já deve ter seu próprio perfil autoral, ver §10 "não deve ser
// apenas uma cópia do comum com mais PV").
const SUGESTAO_MULTIPLICADOR_RARO_VIDA = 2.2;
const SUGESTAO_MULTIPLICADOR_RARO_DANO = 1.6;

// Reaproveita EXATAMENTE a fórmula que combatController.js já usava
// pra recompensa de vitória em Aventura, pra preservar o balanceamento
// atual (pedido explícito da spec, §8/§11).
function xpBaseDoNivel(nivelMonstro) {
  return 15 + nivelMonstro * 8;
}
function ouroBaseDoNivel(nivelMonstro) {
  return 5 + nivelMonstro * 4;
}

// §5 — faixas de perigo pra comparar nível do personagem com a faixa
// recomendada da zona. Nunca bloqueia entrada, só informa.
const LIMIAR_PERIGO = {
  MEDIO: 3, // até 3 níveis abaixo do mínimo da zona
  ALTO: 8, // até 8 níveis abaixo
  // acima de 8 níveis abaixo do mínimo = EXTREMO
};

function calcularPerigo(nivelPersonagem, nivelMin, nivelMax) {
  if (nivelPersonagem >= nivelMin) return "BAIXO";
  const diferenca = nivelMin - nivelPersonagem;
  if (diferenca <= LIMIAR_PERIGO.MEDIO) return "MEDIO";
  if (diferenca <= LIMIAR_PERIGO.ALTO) return "ALTO";
  return "EXTREMO";
}

module.exports = {
  MULTIPLICADOR_RARO_XP,
  MULTIPLICADOR_RARO_OURO,
  SUGESTAO_MULTIPLICADOR_RARO_VIDA,
  SUGESTAO_MULTIPLICADOR_RARO_DANO,
  xpBaseDoNivel,
  ouroBaseDoNivel,
  calcularPerigo,
};
