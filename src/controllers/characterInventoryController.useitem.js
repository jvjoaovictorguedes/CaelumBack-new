// ADICIONAR ao final de src/controllers/characterInventoryController.js
// (mantém os imports que já existem no topo do arquivo: CharacterInventory, Character, Item)

const { sequelize } = require("../config/database");
const ConsumableProperties = require("../models/ConsumableProperties");

// POST /api/character-inventory/use
// body: { id_personagem, id_item, quantidade }
exports.useItem = async (req, res) => {
  const { id_personagem, id_item } = req.body;
  const quantidade = Number(req.body.quantidade) || 1;

  if (!id_personagem || !id_item) {
    return res.status(400).json({
      message: "id_personagem e id_item são obrigatórios.",
    });
  }

  if (quantidade <= 0) {
    return res.status(400).json({ message: "Quantidade inválida." });
  }

  try {
    const result = await sequelize.transaction(async (transaction) => {
      const inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem, id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!inventoryEntry || inventoryEntry.quantidade < quantidade) {
        const error = new Error(
          "Você não possui esse item (ou quantidade insuficiente) no inventário.",
        );
        error.statusCode = 400;
        throw error;
      }

      const item = await Item.findByPk(id_item, { transaction });
      if (!item) {
        const error = new Error("Item não encontrado.");
        error.statusCode = 404;
        throw error;
      }

      if (item.tipo_item !== "Consumivel") {
        const error = new Error("Este item não pode ser usado diretamente.");
        error.statusCode = 400;
        throw error;
      }

      const efeito = await ConsumableProperties.findByPk(id_item, {
        transaction,
      });
      if (!efeito) {
        const error = new Error(
          "Este item não possui efeito configurado (ConsumableProperties).",
        );
        error.statusCode = 400;
        throw error;
      }

      const character = await Character.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!character) {
        const error = new Error("Personagem não encontrado.");
        error.statusCode = 404;
        throw error;
      }

      // Mesma fórmula usada no combatController como teto de vida
      // (o personagem não tem coluna de vida_maxima no banco).
      const vidaMaxima = 30 + (character.vitalidade || 0) * 6;

      if (efeito.efeito_vida) {
        character.vida_atual = Math.min(
          vidaMaxima,
          character.vida_atual + efeito.efeito_vida * quantidade,
        );
      }

      if (efeito.efeito_mana) {
        // OBS: não existe fórmula de mana_maxima estabelecida no projeto ainda,
        // então a mana é somada sem teto por enquanto. Se quiser um limite,
        // me diga a fórmula (ex: baseada em inteligencia) e eu ajusto aqui.
        character.mana_atual =
          character.mana_atual + efeito.efeito_mana * quantidade;
      }

      // efeito_atributo / valor_atributo / duracao_efeito descrevem um buff
      // temporário (ex: +Forca por N turnos). O backend ainda não tem um
      // sistema de status/buffs no combate, então esses campos não são
      // aplicados aqui — só os efeitos instantâneos de vida e mana.

      await character.save({ transaction });

      inventoryEntry.quantidade -= quantidade;
      if (inventoryEntry.quantidade <= 0) {
        await inventoryEntry.destroy({ transaction });
      } else {
        await inventoryEntry.save({ transaction });
      }

      return {
        character,
        inventoryEntry,
        ficouZerado: inventoryEntry.quantidade <= 0,
      };
    });

    return res.status(200).json({
      status: "success",
      message: "Item usado com sucesso!",
      data: {
        character: {
          vida_atual: result.character.vida_atual,
          mana_atual: result.character.mana_atual,
        },
        quantidadeRestante: result.ficouZerado
          ? 0
          : result.inventoryEntry.quantidade,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) {
      console.error("Erro ao usar item:", error);
    }
    return res.status(statusCode).json({
      message: error.statusCode
        ? error.message
        : "Erro interno do servidor ao usar o item.",
    });
  }
};
