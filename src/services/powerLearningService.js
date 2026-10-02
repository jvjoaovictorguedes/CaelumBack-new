// Habilidades V2.0 §13 — centralizador de concessão/validação de Power
// pro personagem (grantPower/alreadyLearned/validateRequirements),
// NUNCA um novo sistema de "habilidade aprendida": toda concessão
// termina em CharacterAbilities, a mesma tabela que
// characterController.comprarPoder/uniqueFeatService/adminUniqueFeatService
// já escrevem. Hoje só o fluxo de Livro de Habilidade (aprenderPorLivro)
// passa por aqui — os fluxos existentes (compra, classe/raça, evolução,
// Proeza Única) continuam como estão, já testados e em produção; migrá-
// los pra este serviço é um passo separado, de puro reuso, sem mudança
// de comportamento, fora do escopo desta adição.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const PowerBook = require("../models/PowerBook");
const inventoryService = require("./inventoryService");
const { MAX_HABILIDADES_ATIVAS_COMBATE } = require("./abilityLevelService");
// Efeito colateral necessário: CharacterAbilities só ganha a associação
// belongsTo(Power) quando characterAbilitiesController é carregado
// (mesmo padrão de combatModifierService.js/test/helpers/db.js).
require("../controllers/characterAbilitiesController");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function alreadyLearned(characterId, idPower, transaction) {
  const existente = await CharacterAbilities.findOne({
    where: { id_personagem: characterId, id_power: idPower },
    transaction,
  });
  return Boolean(existente);
}

// Valida os requisitos opcionais de UM PowerBook contra o personagem —
// todos em conjunto (E lógico); qualquer um configurado e não cumprido
// já barra a concessão. `character` precisa já ter sido carregado (não
// consulta o banco de novo aqui).
async function validarRequisitosDoLivro(character, powerBook, transaction) {
  if (powerBook.nivel_minimo != null && character.nivel < powerBook.nivel_minimo) {
    throw erro(`Esse livro exige nível ${powerBook.nivel_minimo}.`);
  }
  if (powerBook.id_classe != null && character.id_classe !== powerBook.id_classe) {
    throw erro("Esse livro exige uma classe diferente da sua.");
  }
  if (powerBook.id_raca != null && character.id_raca !== powerBook.id_raca) {
    throw erro("Esse livro exige uma raça diferente da sua.");
  }
  if (powerBook.natureza_magica != null && character.natureza_magica !== powerBook.natureza_magica) {
    throw erro(`Esse livro exige a Natureza Mágica ${powerBook.natureza_magica}.`);
  }
  if (powerBook.id_power_prerequisito != null) {
    const prerequisito = await CharacterAbilities.findOne({
      where: { id_personagem: character.id, id_power: powerBook.id_power_prerequisito },
      transaction,
    });
    if (!prerequisito) {
      throw erro("Esse livro exige uma habilidade pré-requisito que você ainda não aprendeu.");
    }
    if (
      powerBook.nivel_power_prerequisito != null &&
      prerequisito.nivel_habilidade < powerBook.nivel_power_prerequisito
    ) {
      throw erro(`A habilidade pré-requisito precisa estar no nível ${powerBook.nivel_power_prerequisito}.`);
    }
  }
}

// Concede UMA Power ao personagem via CharacterAbilities — idempotente
// (lança 409 se já aprendida, nunca cria linha duplicada). Mesmo
// critério de comprarPoder pro cap de habilidades Ativas no combate
// (MAX_HABILIDADES_ATIVAS_COMBATE): Passiva sempre entra ativa (nunca
// ocupa slot); Ativa só nasce is_active=true se ainda há vaga, senão
// fica aprendida mas inativa até o jogador trocar o loadout.
async function grantPower({ characterId, idPower, levelLearned, transaction }) {
  if (await alreadyLearned(characterId, idPower, transaction)) {
    throw erro("Você já aprendeu esse poder.", 409);
  }

  const power = await Power.findByPk(idPower, { transaction });
  if (!power) throw erro("Habilidade não encontrada.", 404);

  let podeAtivar = true;
  if (power.tipo_poder === "Ativo") {
    const jaAtivas = await CharacterAbilities.count({
      where: { id_personagem: characterId, is_active: true },
      include: [{ model: Power, attributes: [], where: { tipo_poder: "Ativo" } }],
      transaction,
    });
    podeAtivar = jaAtivas < MAX_HABILIDADES_ATIVAS_COMBATE;
  }

  return CharacterAbilities.create(
    {
      id_personagem: characterId,
      id_power: idPower,
      level_learned: levelLearned ?? 1,
      is_active: podeAtivar,
    },
    { transaction },
  );
}

// POST /characters/:id/power-books/:idItem/learn (§13) — fluxo completo:
// livro ativo configurado pro item, requisitos cumpridos, item possuído,
// ainda não aprendida; consome 1 unidade do livro e concede a Power.
// Mesmo padrão transacional/de locks de alchemyLearnService.aprenderReceitaFisica
// (trava Character e a linha de inventário ANTES de qualquer mutação).
async function aprenderPorLivro(characterId, idItem) {
  return sequelize.transaction(async (transaction) => {
    const character = await Character.findByPk(characterId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!character) throw erro("Personagem não encontrado.", 404);

    const powerBook = await PowerBook.findOne({
      where: { id_item: idItem, ativo: true },
      transaction,
    });
    if (!powerBook) throw erro("Este item não é um Livro de Habilidade configurado.", 404);

    if (await alreadyLearned(characterId, powerBook.id_power, transaction)) {
      throw erro("Você já aprendeu a habilidade deste livro.", 409);
    }

    await validarRequisitosDoLivro(character, powerBook, transaction);

    const entradaInventario = await CharacterInventory.findOne({
      where: { id_personagem: characterId, id_item: idItem },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!entradaInventario || entradaInventario.quantidade < 1) {
      throw erro("Você não possui esse Livro de Habilidade no inventário.");
    }

    await inventoryService.removeStack(characterId, idItem, 1, transaction);

    const power = await Power.findByPk(powerBook.id_power, { transaction });
    const characterAbility = await grantPower({
      characterId,
      idPower: powerBook.id_power,
      levelLearned: character.nivel,
      transaction,
    });

    return {
      aprendida: true,
      id_power: powerBook.id_power,
      nome_power: power?.nome ?? null,
      characterAbility,
    };
  });
}

module.exports = {
  alreadyLearned,
  validarRequisitosDoLivro,
  grantPower,
  aprenderPorLivro,
};
