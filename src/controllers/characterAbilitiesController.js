// src/controllers/characterAbilitiesController.js
const { sequelize } = require("../config/database");
const CharacterAbilities = require("../models/CharacterAbilities");
const Character = require("../models/Character"); // Importa Character para inclusão
const Power = require("../models/Power"); // Importa Power para inclusão
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const {
  NOME_ITEM_FRAGMENTO,
  NIVEL_MAXIMO_HABILIDADE,
  MAX_HABILIDADES_ATIVAS_COMBATE,
  custoParaEvoluir,
  marcoDoNivel,
  multiplicadorEfeito,
  multiplicadorCustoMana,
} = require("../services/abilityLevelService");

// Sem essas associações, qualquer include: [{model: Character}, {model: Power}]
// abaixo derruba a chamada com "CharacterAbilities is not associated to X!".
Character.hasMany(CharacterAbilities, { foreignKey: "id_personagem" });
CharacterAbilities.belongsTo(Character, { foreignKey: "id_personagem" });

Power.hasMany(CharacterAbilities, { foreignKey: "id_power" }); // Um poder pode ser aprendido por muitos personagens
CharacterAbilities.belongsTo(Power, { foreignKey: "id_power" });

// Criar uma nova habilidade de personagem
exports.createCharacterAbility = async (req, res) => {
  try {
    const newCharacterAbility = await CharacterAbilities.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Habilidade de personagem registrada com sucesso!",
      data: {
        characterAbility: newCharacterAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao registrar habilidade de personagem:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Este personagem já possui este poder." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao registrar habilidade." });
  }
};

// Obter todas as habilidades de personagem (com dados de Character e Power)
exports.getAllCharacterAbilities = async (req, res) => {
  try {
    // Permite filtrar as habilidades de um único personagem
    // (ex: ?characterId=3), do jeito que a tela de combate precisa.
    const { characterId } = req.query;

    if (!characterId) {
      // Sem filtro, isso listaria os poderes aprendidos de TODOS os
      // personagens do jogo pra qualquer usuário autenticado — não é
      // uma tela de jogador que precise disso.
      return res.status(400).json({ message: "characterId é obrigatório." });
    }

    const personagem = await Character.findByPk(characterId, { attributes: ["id", "id_usuario"] });
    if (!personagem) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }
    if (personagem.id_usuario !== req.user.id) {
      return res.status(403).json({ message: "Esse personagem não pertence a você." });
    }

    const whereClause = { id_personagem: characterId };

    const characterAbilities = await CharacterAbilities.findAll({
      where: whereClause,
      include: [
        { model: Character, attributes: ["id", "nome", "nivel"] }, // Inclui id, nome e nível do personagem
        { model: Power }, // Inclui todos os dados do poder (dano, cura, custo de mana etc.)
      ],
    });

    // dano_base/cura_base/custo_mana aqui já saem com o multiplicador do
    // nível da habilidade aplicado (mesmo critério de
    // characterController.montarEntrada) — esta é a lista que a tela de
    // combate (CombatArena.tsx/RankGatePanel.tsx) usa pros botões de
    // poder, então sem isso o número mostrado ali nunca batia com o que
    // combatController.js de fato aplicava (que já usa
    // custoManaEfetivo/calcularEfeitoPoder com o nível certo).
    const comEfeitoAjustado = characterAbilities.map((linha) => {
      const plano = linha.get({ plain: true });
      if (!plano.Power) return plano;
      const multiplicador = multiplicadorEfeito(plano.nivel_habilidade);
      return {
        ...plano,
        Power: {
          ...plano.Power,
          custo_mana: Math.round(plano.Power.custo_mana * multiplicadorCustoMana(plano.nivel_habilidade)),
          dano_base: plano.Power.dano_base ? Math.round(plano.Power.dano_base * multiplicador) : plano.Power.dano_base,
          cura_base: plano.Power.cura_base ? Math.round(plano.Power.cura_base * multiplicador) : plano.Power.cura_base,
        },
      };
    });

    res.status(200).json({
      status: "success",
      results: comEfeitoAjustado.length,
      data: {
        characterAbilities: comEfeitoAjustado,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidades de personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar habilidades." });
  }
};

// Obter uma habilidade de personagem por ID
exports.getCharacterAbilityById = async (req, res) => {
  try {
    const characterAbility = await CharacterAbilities.findByPk(req.params.id, {
      include: [
        { model: Character, attributes: ["id", "nome", "nivel", "id_usuario"] },
        { model: Power, attributes: ["id", "nome", "tipo_poder"] },
      ],
    });
    if (!characterAbility) {
      return res
        .status(404)
        .json({ message: "Habilidade de personagem não encontrada." });
    }
    if (characterAbility.Character?.id_usuario !== req.user.id) {
      return res.status(403).json({ message: "Essa habilidade não pertence a você." });
    }
    res.status(200).json({
      status: "success",
      data: {
        characterAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidade de personagem por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar habilidade." });
  }
};

// Atualizar uma habilidade de personagem por ID
exports.updateCharacterAbility = async (req, res) => {
  try {
    const [updatedRows] = await CharacterAbilities.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Habilidade de personagem não encontrada ou nenhum dado para atualizar.",
        });
    }

    const updatedCharacterAbility = await CharacterAbilities.findByPk(
      req.params.id,
      {
        include: [
          { model: Character, attributes: ["id", "nome", "nivel"] },
          { model: Power, attributes: ["id", "nome", "tipo_poder"] },
        ],
      }
    );
    res.status(200).json({
      status: "success",
      message: "Habilidade de personagem atualizada com sucesso!",
      data: {
        characterAbility: updatedCharacterAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar habilidade de personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar habilidade." });
  }
};

// MAX_HABILIDADES_ATIVAS_COMBATE (ver abilityLevelService.js) é esse
// mesmo is_active que combatController.js e pvpController.js filtram
// pra decidir quais poderes aparecem numa luta, então o limite aqui é o
// que efetivamente limita o loadout de combate (ver aba Combate no
// frontend, "Habilidades em Combate").

// Ativar/desativar um poder já aprendido — uso direto do jogador (não
// admin), pela aba de Combate: "aparecerá todas pra ele, mas se ele
// não tiver nível não pode usar, só ver" — poderes ainda não aprendidos
// nem têm linha em CharacterAbilities (ver getPoderesDisponiveis), então
// chegar aqui já implica que o personagem tem o nível necessário. Só
// falta impedir: (1) mexer no poder de outra pessoa, (2) mandar qualquer
// coisa que não seja um boolean de verdade (mesmo bug de coerção do item
// 18 — guildas), (3) desativar um poder Passivo (não é escolha do
// jogador, é sempre ativo), (4) passar de MAX_HABILIDADES_ATIVAS_COMBATE
// marcadas ao mesmo tempo.
exports.toggleCharacterAbility = async (req, res) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== "boolean") {
      return res.status(400).json({ message: "is_active deve ser boolean." });
    }

    const characterAbility = await CharacterAbilities.findByPk(req.params.id, {
      include: [
        { model: Character, attributes: ["id", "id_usuario"] },
        { model: Power, attributes: ["id", "tipo_poder"] },
      ],
    });
    if (!characterAbility) {
      return res.status(404).json({ message: "Habilidade de personagem não encontrada." });
    }
    if (characterAbility.Character?.id_usuario !== req.user.id) {
      return res.status(403).json({ message: "Essa habilidade não pertence a você." });
    }
    if (characterAbility.Power?.tipo_poder !== "Ativo") {
      return res.status(400).json({
        message: "Poderes passivos não podem ser desativados.",
      });
    }

    if (is_active && !characterAbility.is_active) {
      const jaAtivas = await CharacterAbilities.count({
        where: { id_personagem: characterAbility.id_personagem, is_active: true },
        include: [{ model: Power, attributes: [], where: { tipo_poder: "Ativo" } }],
      });
      if (jaAtivas >= MAX_HABILIDADES_ATIVAS_COMBATE) {
        return res.status(400).json({
          message: `Você já tem ${MAX_HABILIDADES_ATIVAS_COMBATE} habilidades marcadas pro combate. Desmarque uma antes de marcar essa.`,
        });
      }
    }

    characterAbility.is_active = is_active;
    await characterAbility.save();

    res.status(200).json({
      status: "success",
      data: { characterAbility },
    });
  } catch (error) {
    console.error("Erro ao alternar habilidade de personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao alternar habilidade." });
  }
};

// Evoluir uma habilidade já aprendida de nível 1 até NIVEL_MAXIMO_HABILIDADE
// (10) — gasta ouro do personagem + Fragmento de Grimório do inventário
// (ver abilityLevelService.js pra tabela de custo/efeito). Tudo dentro de
// uma transaction com lock nas duas linhas que perdem recurso (Character
// e a entrada do fragmento no inventário) — mesmo padrão de
// characterInventoryController/marketController pra não permitir gastar
// o mesmo ouro/fragmento duas vezes com dois cliques rápidos.
exports.evolveCharacterAbility = async (req, res) => {
  try {
    // Sequelize não deixa combinar `lock` com `include` (o JOIN vira LEFT
    // OUTER, que o Postgres recusa com FOR UPDATE) — mesma restrição já
    // contornada em market/characterInventoryController: busca sem lock
    // só pra achar o dono/o poder, e trava cada linha que perde recurso
    // separadamente, na ordem em que são lidas.
    const characterAbilityInfo = await CharacterAbilities.findByPk(req.params.id, {
      include: [
        { model: Character, attributes: ["id", "id_usuario"] },
        { model: Power, attributes: ["id", "nome"] },
      ],
    });
    if (!characterAbilityInfo) {
      return res.status(404).json({ message: "Habilidade de personagem não encontrada." });
    }
    if (characterAbilityInfo.Character?.id_usuario !== req.user.id) {
      return res.status(403).json({ message: "Essa habilidade não pertence a você." });
    }

    const nomePoder = characterAbilityInfo.Power?.nome ?? "Esta habilidade";
    const idPersonagem = characterAbilityInfo.id_personagem;

    const resultado = await sequelize.transaction(async (transaction) => {
      const characterAbility = await CharacterAbilities.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const custo = custoParaEvoluir(characterAbility.nivel_habilidade);
      if (!custo) {
        return { erro: { status: 400, message: `${nomePoder} já está no nível máximo.` } };
      }

      const personagem = await Character.findByPk(idPersonagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (personagem.dinheiro < custo.ouro) {
        return { erro: { status: 400, message: "Ouro insuficiente para evoluir essa habilidade." } };
      }

      const itemFragmento = await Item.findOne({ where: { nome: NOME_ITEM_FRAGMENTO }, transaction });
      const entradaFragmento = itemFragmento
        ? await CharacterInventory.findOne({
            where: { id_personagem: idPersonagem, id_item: itemFragmento.id },
            transaction,
            lock: transaction.LOCK.UPDATE,
          })
        : null;

      if (!entradaFragmento || entradaFragmento.quantidade < custo.fragmentos) {
        return {
          erro: {
            status: 400,
            message: `Você precisa de ${custo.fragmentos}x ${NOME_ITEM_FRAGMENTO} pra evoluir essa habilidade.`,
          },
        };
      }

      personagem.dinheiro -= custo.ouro;
      entradaFragmento.quantidade -= custo.fragmentos;
      characterAbility.nivel_habilidade += 1;

      await personagem.save({ transaction });
      if (entradaFragmento.quantidade > 0) {
        await entradaFragmento.save({ transaction });
      } else {
        await entradaFragmento.destroy({ transaction });
      }
      await characterAbility.save({ transaction });

      return { characterAbility };
    });

    if (resultado.erro) {
      return res.status(resultado.erro.status).json({ message: resultado.erro.message });
    }

    res.status(200).json({
      status: "success",
      data: {
        characterAbility: resultado.characterAbility,
        marco: marcoDoNivel(resultado.characterAbility.nivel_habilidade),
        proxima_evolucao: custoParaEvoluir(resultado.characterAbility.nivel_habilidade),
      },
    });
  } catch (error) {
    console.error("Erro ao evoluir habilidade de personagem:", error);
    res.status(500).json({ message: "Erro interno do servidor ao evoluir habilidade." });
  }
};

// Deletar uma habilidade de personagem por ID
exports.deleteCharacterAbility = async (req, res) => {
  try {
    const deletedRows = await CharacterAbilities.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({ message: "Habilidade de personagem não encontrada." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Habilidade de personagem deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar habilidade de personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar habilidade." });
  }
};
