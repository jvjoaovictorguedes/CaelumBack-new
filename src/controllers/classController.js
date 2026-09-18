// src/controllers/classController.js
const { sequelize } = require("../config/database");
const Class = require("../models/Class");
const CharacterCreationRoll = require("../models/CharacterCreationRoll");
const {
  PROPOSITO_CLASSE,
  sortearClasseRaraGanhou,
  indiceAleatorio,
  emitirTicket,
} = require("../services/raridadeRolagemService");

// Criar uma nova classe
exports.createClass = async (req, res) => {
  try {
    const newClass = await Class.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Classe criada com sucesso!",
      data: {
        class: newClass,
      },
    });
  } catch (error) {
    console.error("Erro ao criar classe:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe uma classe com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar classe." });
  }
};

// Obter todas as classes
// Só as NÃO raras — classes raras (Primordial etc.) nunca aparecem na
// criação normal, só via ticket do sorteio (POST /sortear-raro). Sem
// esse filtro aqui, a migration que corrige o campo `raro` no banco
// (20260919040000-fix-raro-backfill-primordial-celestial.js) não
// adianta nada: o dado fica certo, mas esse endpoint devolvia todo
// mundo pro front do mesmo jeito.
exports.getAllClasses = async (req, res) => {
  try {
    const classes = await Class.findAll({ where: { raro: false } });
    res.status(200).json({
      status: "success",
      results: classes.length,
      data: {
        classes,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar classes:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar classes." });
  }
};

// Obter uma classe por ID
exports.getClassById = async (req, res) => {
  try {
    const classItem = await Class.findByPk(req.params.id); // Usando classItem para evitar conflito com palavra reservada 'class'
    if (!classItem) {
      return res.status(404).json({ message: "Classe não encontrada." });
    }
    res.status(200).json({
      status: "success",
      data: {
        class: classItem,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar classe por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar classe." });
  }
};

// Atualizar uma classe por ID
exports.updateClass = async (req, res) => {
  try {
    const [updatedRows] = await Class.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Classe não encontrada ou nenhum dado para atualizar.",
        });
    }

    const updatedClass = await Class.findByPk(req.params.id); // Busca a classe atualizada
    res.status(200).json({
      status: "success",
      message: "Classe atualizada com sucesso!",
      data: {
        class: updatedClass,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar classe:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe uma classe com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar classe." });
  }
};

// POST /api/classes/sortear-raro
// Mesma ideia de raceController.sortearRacaRara: o SERVIDOR decide se o
// usuário ganhou acesso a uma classe rara e qual foi liberada, mas só
// UMA VEZ POR CONTA, pra sempre — o resultado (ganhou ou não, e QUAL
// classe rara especificamente) fica gravado em CharacterCreationRoll.
// Diferente da raça, aqui o sorteio já escolhe uma classe específica
// (não é o jogador quem escolhe depois), então precisa persistir
// também class_rare_id — sem isso, um retry depois de ganhar podia
// sortear uma classe rara DIFERENTE da primeira.
exports.sortearClasseRara = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const [linha] = await CharacterCreationRoll.findOrCreate({
        where: { id_usuario: req.user.id },
        defaults: {},
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!linha.class_roll_done) {
        linha.class_roll_done = true;
        linha.class_rare_won = sortearClasseRaraGanhou();

        if (linha.class_rare_won) {
          const classesRaras = await Class.findAll({ where: { raro: true }, transaction });
          if (classesRaras.length > 0) {
            linha.class_rare_id = classesRaras[indiceAleatorio(classesRaras.length)].id;
          } else {
            linha.class_rare_won = false;
          }
        }

        await linha.save({ transaction });
      }

      if (!linha.class_rare_won || !linha.class_rare_id) {
        return { raro: false };
      }

      const classeSorteada = await Class.findByPk(linha.class_rare_id, { transaction });
      if (!classeSorteada) {
        return { raro: false };
      }

      return {
        raro: true,
        classe: classeSorteada,
        ticket: emitirTicket(PROPOSITO_CLASSE, req.user.id, classeSorteada.id),
      };
    });

    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    console.error("Erro ao sortear classe rara:", error);
    res.status(500).json({ message: "Erro interno do servidor ao sortear classe." });
  }
};

// Deletar uma classe por ID
exports.deleteClass = async (req, res) => {
  try {
    const deletedRows = await Class.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: "Classe não encontrada." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Classe deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar classe:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar classe." });
  }
};
