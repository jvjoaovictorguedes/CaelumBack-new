// Poder de Combate (§8-18 da Especificação Consolidada Poder/Status/
// Cooldown/Balanceamento). Poder é INDICADOR, nunca multiplica dano/
// vida/defesa/chance de status — serve só pra UI, comparação,
// recomendação de dificuldade e auditoria (§3).
//
// Mudar qualquer coeficiente aqui muda o número mostrado pro jogador —
// por isso a versão (§9): resultado do cálculo sempre carrega
// `version`, pra uma mudança futura nunca parecer "seu personagem ficou
// mais fraco do nada".
const COMBAT_POWER_VERSION = 1;

// Janela padrão de turnos pra medir dano sustentável (§13).
const HORIZONTE_PADRAO = 4;

// Escala de exibição — calibrável, não escolhida por capricho (§15
// avisa: "coeficientes finais devem ser calibrados, não escolhidos
// arbitrariamente"). Valor inicial escolhido só pra colocar os números
// numa faixa de milhares, fácil de comparar visualmente; revisar quando
// o simulador (Fase 6, ainda não construído) puder calibrar de verdade.
const POWER_DISPLAY_SCALE = 12;

// §45/Evolução do Motor de Status §24 — peso de utilidade POR status de
// controle: conservador e com CAP, pra uma chance pequena de controle
// nunca inflar o Poder mais que diferenças reais de DPS/EHP. Hard
// controls (Freeze/Stun) pesam um pouco mais que os parciais/
// probabilísticos (Paralyze/Blind/Silence/Weaken) — ainda assim números
// de estimativa de utilidade, não de balanceamento de gameplay; a
// calibrar quando o simulador (Fase 6) existir.
const UTILITY_PESO_POR_STATUS = {
  SILENCE: 0.05,
  WEAKEN: 0.05,
  FREEZE: 0.08,
  STUN: 0.08,
  PARALYZE: 0.06,
  BLIND: 0.04,
};
const UTILITY_CAP_CONTROLE = 1.15;

module.exports = {
  COMBAT_POWER_VERSION,
  HORIZONTE_PADRAO,
  POWER_DISPLAY_SCALE,
  UTILITY_PESO_POR_STATUS,
  UTILITY_CAP_CONTROLE,
};
