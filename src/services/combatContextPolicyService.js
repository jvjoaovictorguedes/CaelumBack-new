// IA de Combate PvE & Habilidades de Monstros V1 (§3.1/§7) — "Context
// Policy: permitir/proibir capacidades por modo; não deve escolher a
// melhor ação" (isso é combatAiService). Implementa a tabela de §7
// (PvE normal / Guild Boss / World Boss — Temple Boss fica pro
// documento separado do Templo) e a "Hard rule de Boss coletivo":
// HEAL_HP/REGEN_HP/SHIELD NUNCA são permitidos em Guild Boss/World
// Boss, mesmo que alguém tente marcar explicitlyAllowed — defesa em
// profundidade, validado de novo no cadastro (monsterAbilityService) e
// no runtime (combatAiService).
const { capabilityValida, ehCapabilityDeSustainProibidaEmBossColetivo } = require("../config/powerCapabilityConfig");

// Modos cobertos por esta policy — PVP_CASUAL/RANKED/TOURNAMENT ficam de
// fora (§1 "PvP fora de escopo: jogadores continuam escolhendo as
// próprias ações"), e TEMPLE_BOSS ainda não existe como contexto no
// motor (§8 "será especificado no documento separado do Templo").
const MODOS_PVE = ["PVE", "PARTY", "GUILD_BOSS", "WORLD_BOSS"];
const BOSSES_COLETIVOS = ["GUILD_BOSS", "WORLD_BOSS"];

function erro(mensagem) {
  return Object.assign(new Error(mensagem), { statusCode: 400 });
}

function modoPveValido(modo) {
  return MODOS_PVE.includes(modo);
}

// §7 — DAMAGE/DEBUFF_CONTROL/OFFENSIVE_BUFF/DISPEL_TARGET: ✅ em todo
// modo PvE. DEFENSIVE_BUFF/CLEANSE_SELF em Boss coletivo: "⚠️ apenas se
// explicitamente permitido" (explicitlyAllowed). HEAL_HP/REGEN_HP/SHIELD
// em Boss coletivo: ❌ hard rule, nenhum override possível.
function capacidadePermitidaNoContexto(capability, contexto, { explicitlyAllowed = false } = {}) {
  if (!capabilityValida(capability)) {
    throw erro(`Capability desconhecida: "${capability}".`);
  }
  if (!modoPveValido(contexto)) {
    throw erro(`Contexto de IA PvE desconhecido: "${contexto}". Válidos: ${MODOS_PVE.join(", ")}.`);
  }

  const ehBossColetivo = BOSSES_COLETIVOS.includes(contexto);
  if (!ehBossColetivo) return true;

  if (ehCapabilityDeSustainProibidaEmBossColetivo(capability)) return false;
  if (capability === "DEFENSIVE_BUFF" || capability === "CLEANSE_SELF") return explicitlyAllowed;
  return true;
}

// Dado o Set/array de capabilities de uma Power, diz se ELA PODE ser
// usada neste contexto (nenhuma de suas capabilities pode ser proibida —
// uma Power com efeito misto DAMAGE+SHIELD, por ex., fica de fora
// inteira de Guild/World Boss, nunca "parcialmente" aplicada).
function powerPermitidaNoContexto(capabilities, contexto, opts) {
  for (const capability of capabilities) {
    if (!capacidadePermitidaNoContexto(capability, contexto, opts)) return false;
  }
  return true;
}

// Usado no cadastro (monsterAbilityService) e como defesa em profundidade
// no runtime: motivo legível de por que uma Power foi rejeitada, ou null
// se está tudo OK.
function motivoDeRejeicao(capabilities, contexto, opts) {
  for (const capability of capabilities) {
    if (!capacidadePermitidaNoContexto(capability, contexto, opts)) {
      return ehCapabilityDeSustainProibidaEmBossColetivo(capability)
        ? `Capability "${capability}" nunca é permitida em ${contexto} (Hard rule de Boss coletivo).`
        : `Capability "${capability}" não está explicitamente permitida em ${contexto}.`;
    }
  }
  return null;
}

module.exports = {
  MODOS_PVE,
  BOSSES_COLETIVOS,
  modoPveValido,
  capacidadePermitidaNoContexto,
  powerPermitidaNoContexto,
  motivoDeRejeicao,
};
