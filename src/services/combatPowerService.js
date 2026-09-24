// Poder de Combate (§8-18 da Especificação Consolidada Poder/Status/
// Cooldown/Balanceamento). Centraliza a fórmula — frontend, Aventura,
// Perfil, Inventário e Admin só CONSOMEM o resultado, nunca recalculam
// por conta própria (§8).
//
// Regra de ouro (§11, evitar dupla contagem): os "snapshots" recebidos
// aqui já são EFETIVOS (atributo base + bônus de equipamento +
// refinamento + multiplicador de classe já embutidos, exatamente como
// combatController monta `jogadorEfetivo`) — este arquivo nunca soma
// Tier/Raridade/Refino de novo por cima.
const Character = require("../models/Character");
const Class = require("../models/Class");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const { buscarBonusDeAtributos, personagemComBonus } = require("./equipmentBonusService");
const {
  comMultiplicadoresDeClasse,
  vidaMaximaDe,
  manaMaximaDe,
  danoBasicoEsperado,
  calcularEfeitoPoderEsperado,
  custoManaEfetivo,
  CONSTANTE_MITIGACAO_DEFESA,
} = require("./combatFormulas");
const { efeitosConfiguradosDoPoder } = require("./combatEffectResolver");
const cooldownService = require("./cooldownService");
const {
  COMBAT_POWER_VERSION,
  HORIZONTE_PADRAO,
  POWER_DISPLAY_SCALE,
  UTILITY_PESO_POR_STATUS,
  UTILITY_CAP_CONTROLE,
} = require("../config/combatPowerConfig");
const WeaponStatusEffect = require("../models/WeaponStatusEffect");

function ehpAjustado(personagem) {
  const vidaMax = vidaMaximaDe(personagem);
  const defesa = personagem.defesa || 0;
  const mitigacao = defesa / (defesa + CONSTANTE_MITIGACAO_DEFESA);
  return vidaMax / Math.max(0.01, 1 - mitigacao);
}

// Otimizador guloso da janela de dano (§13/§43): em cada uma das
// `horizonte` ações, escolhe a maior opção de dano esperado disponível
// (ataque básico ou uma habilidade ativa) respeitando Mana e Cooldown
// simulados — reaproveita cooldownService, a MESMA semântica usada no
// combate de verdade, pra nunca divergir da regra real. Simplificação
// registrada: não soma o dano esperado de DoT que a própria habilidade
// possa aplicar (só o dano/cura diretos) — ver relatório final.
function otimizarJanelaDeDano({ personagem, habilidadesAtivas, horizonte }) {
  let manaDisponivel = manaMaximaDe(personagem);
  let cooldowns = {};
  let danoTotal = 0;

  for (let acao = 0; acao < horizonte; acao += 1) {
    let melhor = { dano: danoBasicoEsperado(personagem), usouPower: null };
    for (const { power, nivelHabilidade } of habilidadesAtivas) {
      if (!cooldownService.podeUsar(cooldowns, power.id)) continue;
      const custo = custoManaEfetivo(power, nivelHabilidade);
      if (custo > manaDisponivel) continue;
      const { dano } = calcularEfeitoPoderEsperado(power, personagem, nivelHabilidade);
      if (dano > melhor.dano) melhor = { dano, usouPower: { power, custo } };
    }

    danoTotal += melhor.dano;
    const chavesNesteTurno = new Set();
    if (melhor.usouPower) {
      manaDisponivel -= melhor.usouPower.custo;
      cooldowns = cooldownService.iniciarCooldown(cooldowns, melhor.usouPower.power.id, melhor.usouPower.power.cooldown);
      chavesNesteTurno.add(cooldownService.chaveDoPoder(melhor.usouPower.power.id));
    }
    cooldowns = cooldownService.decrementarCooldowns(cooldowns, chavesNesteTurno);
  }
  return danoTotal;
}

// §45/Evolução do Motor de Status §24 — bônus conservador e limitado por
// status de controle configurados nas habilidades ATIVAS e na arma
// equipada (Silence/Weaken/Freeze/Stun/Paralyze/Blind), ponderado pela
// chance de cada um disparar. `efeitosDeStatus` já vem resolvido (ver
// calcularPoderPersonagem) pra esta função continuar 100% síncrona e
// determinística (nunca soma o mesmo efeito duas vezes: cada fonte —
// Power ou arma — entra como um item separado da lista).
function fatorDeUtilidade(fontesDeEfeito) {
  let bonus = 0;
  for (const { efeitosDeStatus = [] } of fontesDeEfeito) {
    for (const efeito of efeitosDeStatus) {
      const peso = UTILITY_PESO_POR_STATUS[efeito.status_key];
      if (!peso) continue;
      const chance = Math.min(1, (efeito.chance_ppm || 0) / 1_000_000);
      bonus += chance * peso;
    }
  }
  return Math.min(UTILITY_CAP_CONTROLE, 1 + bonus);
}

// Núcleo puro e determinístico (§14) — mesmo snapshot sempre devolve o
// mesmo Poder, sem Math.random. `snapshot` precisa ser um personagem
// EFETIVO (ver cabeçalho do arquivo) com `habilidadesAtivas:
// [{power, nivelHabilidade, efeitosDeStatus}]`.
function calcularPoderPersonagemDeSnapshot(snapshot) {
  const habilidadesAtivas = snapshot.habilidadesAtivas || [];
  const dpr = otimizarJanelaDeDano({ personagem: snapshot, habilidadesAtivas, horizonte: HORIZONTE_PADRAO });
  const ehp = ehpAjustado(snapshot);
  // Utilidade considera as habilidades ativas E o proc de arma equipada
  // (Evolução do Motor de Status §24) — lista separada de habilidadesAtivas
  // pra nunca confundir otimizarJanelaDeDano (que espera `power` de
  // verdade em cada entrada) com a fonte de arma, que não tem Power
  // nenhum por trás.
  const fontesDeEfeito = snapshot.fontesDeEfeitoParaUtilidade ?? habilidadesAtivas;
  const utilityFactor = fatorDeUtilidade(fontesDeEfeito);
  const rawPower = Math.sqrt(Math.max(1, dpr) * Math.max(1, ehp));

  return {
    version: COMBAT_POWER_VERSION,
    dpr,
    ehp,
    utilityFactor,
    rawPower,
    combatPower: Math.round(rawPower * POWER_DISPLAY_SCALE * utilityFactor),
  };
}

// Wrapper assíncrono (§8) — carrega o personagem real, monta o snapshot
// EFETIVO exatamente como combatController.gerarInimigoParaPersonagem já
// faz (mesmo bônus de equipamento, mesmos multiplicadores de classe) e
// resolve os efeitos de status configurados de cada habilidade ativa
// antes de entrar no núcleo puro acima.
async function calcularPoderPersonagem(characterId) {
  const character = await Character.findByPk(characterId);
  if (!character) return null;

  const classe = await Class.findByPk(character.id_classe);
  const bonusEquipamento = await buscarBonusDeAtributos(character.id);
  const jogadorEfetivo = comMultiplicadoresDeClasse(
    personagemComBonus(character.toJSON(), bonusEquipamento),
    classe,
  );

  const abilities = await CharacterAbilities.findAll({
    where: { id_personagem: character.id, is_active: true },
    include: [{ model: Power }],
  });

  const habilidadesAtivas = [];
  for (const ability of abilities) {
    const power = ability.Power;
    if (!power || power.tipo_poder !== "Ativo") continue;
    const efeitosDeStatus = await efeitosConfiguradosDoPoder(power);
    habilidadesAtivas.push({ power, nivelHabilidade: ability.nivel_habilidade ?? 1, efeitosDeStatus });
  }

  // Efeito esperado de arma entra na utilidade do Poder uma única vez
  // (§24) — nunca somado de novo em otimizarJanelaDeDano, que só olha
  // `habilidadesAtivas` (sem a arma) pra calcular DPR.
  const efeitosDaArma = jogadorEfetivo.arma_equipada?.id_item
    ? await WeaponStatusEffect.findAll({ where: { id_item: jogadorEfetivo.arma_equipada.id_item, ativo: true } })
    : [];
  const fontesDeEfeitoParaUtilidade = [
    ...habilidadesAtivas,
    { efeitosDeStatus: efeitosDaArma.map((e) => ({ status_key: e.status_key, chance_ppm: e.chance_ppm })) },
  ];

  return calcularPoderPersonagemDeSnapshot({ ...jogadorEfetivo, habilidadesAtivas, fontesDeEfeitoParaUtilidade });
}

// Poder do monstro (§16) — calculado a partir do SNAPSHOT REAL do
// encontro (vida_maxima/dano_base já calibrados por gerarInimigo), nunca
// gravado fixo no AdventureMonster. Monstros de PvE hoje não têm Defesa
// nem habilidades ativas (só ataque básico), então EHP = vida_maxima
// puro e DPR = dano_base ao longo da janela.
function calcularPoderMonstro(enemySnapshot) {
  const dpr = Math.max(1, enemySnapshot.dano_base || 0) * HORIZONTE_PADRAO;
  const ehp = Math.max(1, enemySnapshot.vida_maxima || 1);
  const rawPower = Math.sqrt(Math.max(1, dpr) * Math.max(1, ehp));

  return {
    version: COMBAT_POWER_VERSION,
    dpr,
    ehp,
    utilityFactor: 1,
    rawPower,
    combatPower: Math.round(rawPower * POWER_DISPLAY_SCALE),
  };
}

// Delta de Poder ao equipar (§8) — recebe os bônus JÁ calculados (atual
// vs. se equipar) de quem chama (ex.: inventoryController, que já sabe
// resolver "bônus se eu equipar este item" via equipmentBonusService) e
// devolve os dois Poderes junto com a diferença, pro preview do
// Inventário (§67).
async function calcularDeltaPoderAoEquipar({ characterId, snapshotAtual, snapshotSeEquipar }) {
  const poderAtual = calcularPoderPersonagemDeSnapshot(snapshotAtual);
  const poderSeEquipar = calcularPoderPersonagemDeSnapshot(snapshotSeEquipar);
  return {
    characterId,
    poderAtual: poderAtual.combatPower,
    poderSeEquipar: poderSeEquipar.combatPower,
    delta: poderSeEquipar.combatPower - poderAtual.combatPower,
  };
}

function compararPoderes(poderA, poderB) {
  const diferenca = poderB - poderA;
  const percentual = poderA > 0 ? Math.round((diferenca / poderA) * 1000) / 10 : null;
  return { diferenca, percentual };
}

module.exports = {
  ehpAjustado,
  otimizarJanelaDeDano,
  fatorDeUtilidade,
  calcularPoderPersonagemDeSnapshot,
  calcularPoderPersonagem,
  calcularPoderMonstro,
  calcularDeltaPoderAoEquipar,
  compararPoderes,
};
