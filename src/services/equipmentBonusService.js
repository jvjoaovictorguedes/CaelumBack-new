// src/services/equipmentBonusService.js
//
// Soma os bônus de atributo dos itens equipados por um personagem.
// Calculado sob demanda (não persiste nada em Character) — assim o
// bônus nunca fica "preso" se o item for trocado/removido, e não tem
// risco de contar em dobro com a distribuição de pontos.

const CharacterEquipment = require("../models/CharacterEquipment");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const { ATRIBUTO_PARA_CAMPO } = require("./combatFormulas");
const { multiplicadorEfeito } = require("./abilityLevelService");
const { propriedadesEfetivasArma, propriedadesEfetivasArmadura } = require("./equipmentRefinementService");
const { resolverConjuntosEquipados } = require("./equipmentSetService");
// Só o require garante que a associação (com alias explícito) já foi
// declarada — ver models/associations.js pra fonte única.
require("../models/associations");

function bonusZerado() {
  return { forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0, defesa: 0 };
}

// Retorna a soma dos bônus de todos os itens equipados pelo personagem.
// `transaction` é opcional — necessário quando o chamador precisa ler o
// equipamento já dentro de uma transação em andamento (ex.: recalcular
// vida/mana máxima logo depois de um equip/unequip, na MESMA transação
// que gravou a mudança — sem passar a transaction aqui, essa leitura
// rodaria numa conexão separada e não enxergaria a alteração ainda não
// commitada).
async function buscarBonusDeAtributos(idPersonagem, transaction) {
  const [equipamentos, passivasAtivas, setState] = await Promise.all([
    CharacterEquipment.findAll({
      where: { id_personagem: idPersonagem },
      include: [
        {
          model: Item,
          as: "item",
          include: [
            { model: WeaponProperties, as: "weaponProperties" },
            { model: ArmorProperties, as: "armorProperties" },
          ],
        },
        // Inventário v2 (§6/§7) — id_instancia é null pra equipamento
        // legado (refinamento 0 durante a migração, comportamento
        // idêntico a antes); quando setado, é dali que vem o
        // refinamento de verdade que escala as propriedades abaixo.
        { model: CharacterEquipmentInstance, as: "instancia" },
      ],
      transaction,
    }),
    // Sem include (evita depender da associação CharacterAbilities<->Power
    // já ter sido registrada por outro require) — busca as habilidades
    // ativas e resolve o Power de cada uma à parte.
    CharacterAbilities.findAll({
      where: { id_personagem: idPersonagem, is_active: true },
      transaction,
    }),
    // Sistema de Conjuntos de Equipamentos — contagem/thresholds/soma de
    // stats já resolvidos por equipmentSetService (fonte única, nunca
    // recalculado aqui); roda em paralelo por fazer sua própria query
    // independente de CharacterEquipment.
    resolverConjuntosEquipados(idPersonagem, transaction),
  ]);

  const bonus = bonusZerado();
  let arma = null;

  if (passivasAtivas.length > 0) {
    const poderes = await Power.findAll({
      where: { id: passivasAtivas.map((p) => p.id_power), tipo_poder: "Passivo" },
      transaction,
    });
    const poderPorId = new Map(poderes.map((p) => [p.id, p]));
    for (const linha of passivasAtivas) {
      const poder = poderPorId.get(linha.id_power);
      if (!poder) continue;
      const campo = ATRIBUTO_PARA_CAMPO[poder.escala_atributo];
      if (!campo || !(campo in bonus)) continue;
      bonus[campo] += (poder.valor_escala || 0) * multiplicadorEfeito(linha.nivel_habilidade);
    }
  }

  for (const equipamento of equipamentos) {
    const item = equipamento.item;
    if (!item) continue;

    // Inventário v2 §6/§7 — o bônus percentual de refinamento incide
    // SÓ nas propriedades do próprio equipamento, nunca nos atributos-
    // base do personagem. Instância null (equipamento legado, ainda
    // sem migrar) equivale a refinamento 0 — propriedadesEfetivas*
    // devolve os valores crus intactos nesse caso.
    const refinamento = equipamento.instancia?.refinamento ?? 0;
    const armorEfetivo = propriedadesEfetivasArmadura(item.armorProperties, refinamento);
    const weaponEfetivo = propriedadesEfetivasArma(item.weaponProperties, refinamento);

    if (armorEfetivo) {
      bonus.forca += armorEfetivo.bonus_forca || 0;
      bonus.vitalidade += armorEfetivo.bonus_vitalidade || 0;
      bonus.agilidade += armorEfetivo.bonus_agilidade || 0;
      bonus.inteligencia += armorEfetivo.bonus_inteligencia || 0;
      bonus.velocidade += armorEfetivo.bonus_velocidade || 0;
      // Essa soma existia até aqui e morria: a "defesa" do item nunca saía
      // desse laço nem chegava a personagemComBonus, então equipar
      // armadura não reduzia dano nenhum — ver aplicarMitigacaoDeDefesa em
      // combatFormulas.js pra onde esse valor passa a ser usado de fato.
      bonus.defesa += armorEfetivo.defesa || 0;
    }

    if (weaponEfetivo?.bonus_atributo) {
      const campo = ATRIBUTO_PARA_CAMPO[weaponEfetivo.bonus_atributo];
      if (campo) {
        bonus[campo] += weaponEfetivo.valor_bonus_atributo || 0;
      }
    }

    // A faixa de dano da arma (dano_min/dano_max) só existia no banco —
    // nada usava. Guardamos aqui a da mão principal pra calcularDanoBasico
    // usar no ataque básico, em vez de só olhar a força.
    if (equipamento.slot === "ArmaPrincipal" && weaponEfetivo) {
      arma = {
        id_item: item.id,
        dano_min: weaponEfetivo.dano_min,
        dano_max: weaponEfetivo.dano_max,
      };
    }
  }

  // Sistema de Conjuntos de Equipamentos (§7 da Especificação) — soma os
  // stats de todos os thresholds ativos por cima do bônus de
  // equipamento/passivas de habilidade já calculado acima. Refinamento
  // NUNCA multiplica bônus de conjunto (§3/§15) — statBonus já vem
  // pronto de equipmentSetService, sem passar por
  // propriedadesEfetivas*.
  bonus.forca += setState.statBonus.forca || 0;
  bonus.vitalidade += setState.statBonus.vitalidade || 0;
  bonus.agilidade += setState.statBonus.agilidade || 0;
  bonus.inteligencia += setState.statBonus.inteligencia || 0;
  bonus.velocidade += setState.statBonus.velocidade || 0;
  bonus.defesa += setState.statBonus.defesa || 0;

  // Arredonda aqui pra já sair um número limpo tanto pro combate quanto
  // pra exibição — bônus de arma (valor_bonus_atributo) é FLOAT.
  for (const campo of Object.keys(bonus)) {
    bonus[campo] = Math.round(bonus[campo]);
  }

  return { ...bonus, arma, activeSetEffects: setState.activeEffects };
}

// Devolve uma cópia do personagem com os atributos somados ao bônus de
// equipamento (arredondado — o resto do jogo trabalha com atributos
// inteiros, e valor_bonus_atributo de arma é FLOAT).
function personagemComBonus(personagemBase, bonus) {
  const b = bonus ?? bonusZerado();
  return {
    ...personagemBase,
    forca: Math.round((personagemBase.forca || 0) + (b.forca || 0)),
    vitalidade: Math.round((personagemBase.vitalidade || 0) + (b.vitalidade || 0)),
    agilidade: Math.round((personagemBase.agilidade || 0) + (b.agilidade || 0)),
    inteligencia: Math.round((personagemBase.inteligencia || 0) + (b.inteligencia || 0)),
    velocidade: Math.round((personagemBase.velocidade || 0) + (b.velocidade || 0)),
    // Personagem não tem "defesa" base própria (não é um atributo
    // distribuível) — vem inteiramente do equipamento.
    defesa: Math.round(b.defesa || 0),
    arma_equipada: b.arma ?? null,
  };
}

module.exports = { buscarBonusDeAtributos, personagemComBonus, bonusZerado };
