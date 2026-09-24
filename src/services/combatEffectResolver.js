// Resolve os efeitos de status de uma Power no instante em que ela é
// usada em combate (Evolução do Motor de Status §8 — PowerStatusEffect
// é a ÚNICA fonte de efeitos de habilidade; sem fallback, sem mapa de
// nome legado em português, sem `efeito_status`/`duracao_efeito` —
// colunas removidas de Power, ver migration
// 20261028030000-validar-e-remover-power-legado.js). Sorteia a chance
// sempre no servidor (crypto, nunca o frontend) e devolve instâncias
// prontas pra statusEffectService.aplicarStatus, preservando `target`
// (Self/Enemy) até a aplicação de verdade em combatController.
const crypto = require("crypto");
const PowerStatusEffect = require("../models/PowerStatusEffect");
const { ATRIBUTO_PARA_CAMPO } = require("./combatFormulas");

// Devolve a config canônica de efeitos da Power. Chave inválida deve
// falhar na CRIAÇÃO/configuração (fora de escopo deste arquivo, ver
// Painel Administrativo), nunca silenciosamente aqui durante combate —
// por isso não há normalização/whitelist nesta leitura: o que estiver
// salvo em power_status_effects.ativo=true é usado como está.
async function efeitosConfiguradosDoPoder(power) {
  const linhas = await PowerStatusEffect.findAll({ where: { id_power: power.id, ativo: true } });
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

// Valor de potência ESPERADO (sem RNG) — usado pelo Power Score e
// reaproveitado por weaponEffectResolver.js (mesmo formato de config:
// potency_base/potency_scale_attribute/potency_scale_value). O combate
// de verdade usa exatamente a mesma fórmula, só que com
// `personagemCaster` já sendo os atributos reais de quem lançou/golpeou.
function potenciaEsperada(config, personagemCaster) {
  if (!config.potency_scale_attribute) return config.potency_base;
  const campo = ATRIBUTO_PARA_CAMPO[config.potency_scale_attribute] || null;
  const valorAtributo = campo ? personagemCaster[campo] || 0 : 0;
  return config.potency_base + valorAtributo * config.potency_scale_value;
}

// Sorteia (server-side) se cada efeito configurado da Power dispara
// nesta ativação e devolve as instâncias já prontas pra
// statusEffectService.aplicarStatus. `turno` vira `appliedAtTurn`.
// `target` é preservado (Self/Enemy) — resolverEfeitosDoUso NÃO decide
// em qual lista aplicar; quem chama (combatController) que resolve
// isso, olhando `target` de cada instância.
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
      target: config.target,
    });
  }
  return instancias;
}

module.exports = {
  efeitosConfiguradosDoPoder,
  potenciaEsperada,
  resolverEfeitosDoUso,
};
