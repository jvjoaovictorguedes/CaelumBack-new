// Registry/whitelist de passivas de conjunto (Especificação Sistema de
// Conjuntos §8.1/§13). O banco só guarda `effect_key` + `effect_config`
// (JSONB de dados, nunca código); a passiva de verdade é sempre uma
// função conhecida pelo servidor, cadastrada aqui.
//
// Nenhum conjunto real com passiva 6/6 foi cadastrado ainda (§21 "não
// invente valores finais de balanceamento" / plano de rollout Fase 6-7:
// só ligar passivas depois da base numérica de sets estar estável em
// produção). Este arquivo já nasce pronto para receber a primeira —
// basta adicionar a função aqui e o `effect_key` correspondente numa
// EquipmentSetBonus.
const SET_EFFECT_HANDLERS = {
  // SANGUE_DRACONICO: aplicarSangueDraconico,
};

// Nunca lança pra cima — um effect_key desconhecido ou digitado errado
// no banco não pode derrubar o cálculo de bônus do personagem inteiro,
// só deixar de aplicar aquela passiva específica.
function handlerParaEffectKey(effectKey) {
  const handler = SET_EFFECT_HANDLERS[effectKey];
  if (!handler) {
    console.error(`[equipmentSetEffectRegistry] effect_key desconhecido: "${effectKey}" — passiva ignorada.`);
    return null;
  }
  return handler;
}

module.exports = { SET_EFFECT_HANDLERS, handlerParaEffectKey };
