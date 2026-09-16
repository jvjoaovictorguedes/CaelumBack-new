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
const { ATRIBUTO_PARA_CAMPO } = require("./combatFormulas");

// Faltava em todo lugar (só existia comentado nos controllers de
// propriedades) — sem isso não dá pra incluir WeaponProperties/
// ArmorProperties a partir de um Item.
Item.hasOne(WeaponProperties, { foreignKey: "id_item" });
WeaponProperties.belongsTo(Item, { foreignKey: "id_item" });
Item.hasOne(ArmorProperties, { foreignKey: "id_item" });
ArmorProperties.belongsTo(Item, { foreignKey: "id_item" });

function bonusZerado() {
  return { forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0 };
}

// Retorna a soma dos bônus de todos os itens equipados pelo personagem.
async function buscarBonusDeAtributos(idPersonagem) {
  const equipamentos = await CharacterEquipment.findAll({
    where: { id_personagem: idPersonagem },
    include: [
      {
        model: Item,
        as: "item",
        include: [WeaponProperties, ArmorProperties],
      },
    ],
  });

  const bonus = bonusZerado();
  let arma = null;

  for (const equipamento of equipamentos) {
    const item = equipamento.item;
    if (!item) continue;

    // Sequelize singulariza o alias padrão de hasOne: "ArmorProperties"
    // vira "ArmorProperty" e "WeaponProperties" vira "WeaponProperty".
    if (item.ArmorProperty) {
      bonus.forca += item.ArmorProperty.bonus_forca || 0;
      bonus.vitalidade += item.ArmorProperty.bonus_vitalidade || 0;
      bonus.agilidade += item.ArmorProperty.bonus_agilidade || 0;
      bonus.inteligencia += item.ArmorProperty.bonus_inteligencia || 0;
      bonus.velocidade += item.ArmorProperty.bonus_velocidade || 0;
    }

    if (item.WeaponProperty?.bonus_atributo) {
      const campo = ATRIBUTO_PARA_CAMPO[item.WeaponProperty.bonus_atributo];
      if (campo) {
        bonus[campo] += item.WeaponProperty.valor_bonus_atributo || 0;
      }
    }

    // A faixa de dano da arma (dano_min/dano_max) só existia no banco —
    // nada usava. Guardamos aqui a da mão principal pra calcularDanoBasico
    // usar no ataque básico, em vez de só olhar a força.
    if (equipamento.slot === "ArmaPrincipal" && item.WeaponProperty) {
      arma = {
        dano_min: item.WeaponProperty.dano_min,
        dano_max: item.WeaponProperty.dano_max,
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
    arma_equipada: b.arma ?? null,
  };
}

module.exports = { buscarBonusDeAtributos, personagemComBonus, bonusZerado };
