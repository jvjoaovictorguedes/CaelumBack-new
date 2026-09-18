// src/services/equipmentBonusService.js
//
// Soma os bônus de atributo dos itens equipados por um personagem.
// Calculado sob demanda (não persiste nada em Character) — assim o
// bônus nunca fica "preso" se o item for trocado/removido, e não tem
// risco de contar em dobro com a distribuição de pontos.

const CharacterEquipment = require("../models/CharacterEquipment");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const { ATRIBUTO_PARA_CAMPO } = require("./combatFormulas");
const { multiplicadorEfeito } = require("./abilityLevelService");
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
  const [equipamentos, passivasAtivas] = await Promise.all([
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

    if (item.armorProperties) {
      bonus.forca += item.armorProperties.bonus_forca || 0;
      bonus.vitalidade += item.armorProperties.bonus_vitalidade || 0;
      bonus.agilidade += item.armorProperties.bonus_agilidade || 0;
      bonus.inteligencia += item.armorProperties.bonus_inteligencia || 0;
      bonus.velocidade += item.armorProperties.bonus_velocidade || 0;
      // Essa soma existia até aqui e morria: a "defesa" do item nunca saía
      // desse laço nem chegava a personagemComBonus, então equipar
      // armadura não reduzia dano nenhum — ver aplicarMitigacaoDeDefesa em
      // combatFormulas.js pra onde esse valor passa a ser usado de fato.
      bonus.defesa += item.armorProperties.defesa || 0;
    }

    if (item.weaponProperties?.bonus_atributo) {
      const campo = ATRIBUTO_PARA_CAMPO[item.weaponProperties.bonus_atributo];
      if (campo) {
        bonus[campo] += item.weaponProperties.valor_bonus_atributo || 0;
      }
    }

    // A faixa de dano da arma (dano_min/dano_max) só existia no banco —
    // nada usava. Guardamos aqui a da mão principal pra calcularDanoBasico
    // usar no ataque básico, em vez de só olhar a força.
    if (equipamento.slot === "ArmaPrincipal" && item.weaponProperties) {
      arma = {
        dano_min: item.weaponProperties.dano_min,
        dano_max: item.weaponProperties.dano_max,
      };
    }
  }

  // Arredonda aqui pra já sair um número limpo tanto pro combate quanto
  // pra exibição — bônus de arma (valor_bonus_atributo) é FLOAT.
  for (const campo of Object.keys(bonus)) {
    bonus[campo] = Math.round(bonus[campo]);
  }

  return { ...bonus, arma };
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
