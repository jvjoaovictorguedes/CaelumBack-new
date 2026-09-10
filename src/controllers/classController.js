// src/controllers/classController.js
const Class = require("../models/Class");

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
exports.getAllClasses = async (req, res) => {
  try {
    const classes = await Class.findAll();
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
