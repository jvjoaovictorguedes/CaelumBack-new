// Rebalanceamento de Powers §30 — "Player UI": nunca reimplementado no
// frontend (mesmo princípio de abilityLevelService/combatEffectResolver
// pros previews do Admin). Formata o que o jogador vê sobre uma Power —
// Mana, cooldown, tipo de dano, afinidade (só quando relevante), Status
// possíveis, cura/escudo — sem expor a fórmula interna completa.
const { STATUS } = require("../config/statusEffectConfig");

const TIPO_DANO_LABEL = {
  Fisico: "Físico",
  Magico: "Mágico",
  Verdadeiro: "Verdadeiro",
  Nenhum: null,
};

function afinidadeDe(modelo) {
  if (!modelo) return null;
  return { key: modelo.key, nome: modelo.nome };
}

// §30 — Mantém a afinidade do dano_base (o "componente principal") e a
// afinidade ADICIONAL (added_damage_pct, ex.: Lâmina Flamejante)
// visualmente separadas; INHERIT_WEAPON nunca mostra uma afinidade
// "principal" concreta aqui (depende da arma equipada, que esta Power
// por si só não sabe) — só a adicional, quando existir.
function describirPower(power, { efeitosDeStatus = [], efeitosDeCombate = [] } = {}) {
  const tipoDanoLabel = TIPO_DANO_LABEL[power.tipo_dano] ?? null;
  const afinidadePrincipal = power.affinity_mode === "EXPLICIT" ? afinidadeDe(power.afinidadePrincipal) : null;
  const temAfinidadeAdicional = Number(power.added_damage_pct) > 0 && power.afinidadeAdicional;
  const afinidadeAdicional = temAfinidadeAdicional
    ? { ...afinidadeDe(power.afinidadeAdicional), added_damage_pct: Number(power.added_damage_pct) }
    : null;

  const statusPossiveis = (efeitosDeStatus ?? [])
    .filter((e) => e.ativo !== false)
    .map((e) => STATUS[e.status_key]?.nomeUi ?? e.status_key)
    .filter(Boolean);
  // Ordem estável e sem repetir o mesmo Status duas vezes (uma Power
  // pode ter mais de uma linha pro mesmo status_key em alvos diferentes).
  const statusUnicos = [...new Set(statusPossiveis)];

  const concedeEscudo = (efeitosDeCombate ?? []).some((e) => e.ativo !== false && ["GRANT_SHIELD", "SHIELD_ON_CAST"].includes(e.effect_key));
  const curaDireta = (power.cura_base ?? 0) > 0;

  return {
    nome: power.nome,
    tipo_poder: power.tipo_poder,
    custo_mana: power.custo_mana,
    cooldown: power.cooldown,
    tipo_dano: power.tipo_dano,
    tipo_dano_label: tipoDanoLabel,
    afinidade_principal: afinidadePrincipal,
    afinidade_adicional: afinidadeAdicional,
    status_possiveis: statusUnicos,
    concede_escudo: concedeEscudo,
    cura_direta: curaDireta,
    resumo: montarResumo({ power, tipoDanoLabel, afinidadePrincipal, afinidadeAdicional, statusUnicos, concedeEscudo, curaDireta }),
  };
}

function montarResumo({ power, tipoDanoLabel, afinidadePrincipal, afinidadeAdicional, statusUnicos, concedeEscudo, curaDireta }) {
  const segmentos = [power.nome];

  if (afinidadeAdicional) {
    // §25 — "Lâmina Flamejante: explicar golpe físico imbuído de Fogo"
    // (nunca "virou mágico"): Físico + Fogo, nunca Físico • Fogo.
    segmentos.push(`${tipoDanoLabel} + ${afinidadeAdicional.nome}`);
  } else if (afinidadePrincipal) {
    segmentos.push(`${tipoDanoLabel} • ${afinidadePrincipal.nome}`);
  } else if (tipoDanoLabel) {
    segmentos.push(tipoDanoLabel);
  }

  if (power.tipo_poder === "Ativo") {
    segmentos.push(`${power.custo_mana} Mana • Recarga ${power.cooldown}`);
  }

  if (statusUnicos.length) {
    segmentos.push(`Pode causar ${statusUnicos.join(", ")}`);
  } else if (concedeEscudo) {
    segmentos.push("Concede uma barreira temporária");
  } else if (curaDireta) {
    segmentos.push("Cura o alvo");
  }

  return segmentos.join(" / ");
}

module.exports = { describirPower, TIPO_DANO_LABEL };
