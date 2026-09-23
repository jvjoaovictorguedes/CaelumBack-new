// Resolve os efeitos de status de uma Power no instante em que ela é
// usada em combate (§19 arquitetura, §29-31 da Especificação
// Consolidada). Busca as linhas de PowerStatusEffect (fonte canônica,
// §30) e, se a Power não tiver nenhuma, cai no adapter do campo legado
// `Power.efeito_status`/`duracao_efeito` (§29) — nunca os dois ao mesmo
// tempo. Sorteia a chance sempre no servidor (crypto, nunca o
// frontend) e devolve instâncias prontas pra
// statusEffectService.aplicarStatus.
const crypto = require("crypto");
const PowerStatusEffect = require("../models/PowerStatusEffect");
const { ATRIBUTO_PARA_CAMPO } = require("./combatFormulas");

const MAPA_NOME_LEGADO_PARA_CHAVE = {
  queimadura: "BURN",
  burn: "BURN",
  sangramento: "BLEED",
  bleed: "BLEED",
  veneno: "POISON",
  poison: "POISON",
  silencio: "SILENCE",
  silence: "SILENCE",
  lentidao: "SLOW",
  slow: "SLOW",
  enfraquecimento: "WEAKEN",
  weaken: "WEAKEN",
};

function normalizar(texto) {
  return String(texto)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Devolve a config canônica de efeitos da Power — nunca combina as duas
// fontes: se existir QUALQUER linha ativa em PowerStatusEffect, o campo
// legado é ignorado pra essa Power (evita aplicar o mesmo efeito duas
// vezes depois que o conteúdo for migrado pra tabela filha).
async function efeitosConfiguradosDoPoder(power) {
  const linhas = await PowerStatusEffect.findAll({ where: { id_power: power.id, ativo: true } });
  if (linhas.length > 0) {
    return linhas.map((l) => ({
      status_key: l.status_key,
      chance_ppm: l.chance_ppm,
      duration_turns: l.duration_turns,
      potency_base: l.potency_base,
      potency_scale_attribute: l.potency_scale_attribute,
      potency_scale_value: l.potency_scale_value,
      target: l.target,
    }));
  }

  if (!power.efeito_status) return [];
  const chave = MAPA_NOME_LEGADO_PARA_CHAVE[normalizar(power.efeito_status)];
  if (!chave) return [];
  return [
    {
      status_key: chave,
      chance_ppm: 1_000_000,
      duration_turns: power.duracao_efeito ?? 2,
      potency_base: Math.max(1, Math.round((power.dano_base ?? 10) * 0.2)),
      potency_scale_attribute: null,
      potency_scale_value: 0,
      target: "Enemy",
    },
  ];
}

// Valor de potência ESPERADO (sem RNG, §14/§31) — usado pelo Power
// Score. O combate de verdade usa exatamente a mesma fórmula, só que com
// `personagemCaster` já sendo os atributos reais de quem lançou.
function potenciaEsperada(config, personagemCaster) {
  if (!config.potency_scale_attribute) return config.potency_base;
  const campo = ATRIBUTO_PARA_CAMPO[config.potency_scale_attribute] || null;
  const valorAtributo = campo ? personagemCaster[campo] || 0 : 0;
  return config.potency_base + valorAtributo * config.potency_scale_value;
}

// Sorteia (server-side) se cada efeito configurado da Power dispara
// nesta ativação e devolve as instâncias já prontas pra
// statusEffectService.aplicarStatus. `turno` vira `appliedAtTurn` (§24).
async function resolverEfeitosDoUso({ power, personagemCaster, casterActorId, turno }) {
  const configs = await efeitosConfiguradosDoPoder(power);
  const instancias = [];
  for (const config of configs) {
    const rolagem = crypto.randomInt(0, 1_000_000);
    if (rolagem >= config.chance_ppm) continue;

    instancias.push({
      key: config.status_key,
      sourceActorId: casterActorId,
      sourcePowerId: power.id,
      sourceItemId: null,
      remainingTurns: config.duration_turns,
      stacks: 1,
      potency: potenciaEsperada(config, personagemCaster),
      appliedAtTurn: turno,
    });
  }
  return instancias;
}

module.exports = {
  efeitosConfiguradosDoPoder,
  potenciaEsperada,
  resolverEfeitosDoUso,
};
