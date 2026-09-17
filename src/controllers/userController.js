const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Character = require("../models/Character");
const { emitirTicket } = require("../services/socketTicketService");

require("dotenv").config();
const { JWT_SECRET } = require("../config/jwt");
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

const signToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

const SENHA_MIN_CARACTERES = 8;
const SENHA_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

exports.registerUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    const email = req.body.email?.trim().toLowerCase();
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: "Por favor, preencha todos os campos." });
    }

    if (password.length < SENHA_MIN_CARACTERES || !SENHA_REGEX.test(password)) {
      return res.status(400).json({
        message: `A senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres e incluir letras e números.`,
      });
    }

    const newUser = await User.create({
      username: username.trim(),
      email,
      passwordHash: password,
    });

    const token = signToken(newUser.id);

    newUser.passwordHash = undefined;

    res.status(201).json({
      status: "success",
      token,
      data: {
        user: newUser,
      },
    });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Usuário ou e-mail já cadastrado." });
    }
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        message: error.errors.map((validationError) => validationError.message),
      });
    }
    res.status(500).json({ message: "Erro interno do servidor ao registrar." });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.trim().toLowerCase();
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Por favor, forneça e-mail e senha." });
    }
    const user = await User.findOne({ where: { email } });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    }
    const token = signToken(user.id);

    user.ultimoLogin = new Date();
    await user.save();

    user.passwordHash = undefined;
    const character = await Character.findOne({
      where: { id_usuario: user.id },
    });

    const hasCharacter = !!character;

    res.status(200).json({
      status: "success",
      token,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        hasCharacter: hasCharacter,
      },
    });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao fazer login." });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ["passwordHash"] },
    });

    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar usuário." });
  }
};

// GET /api/users/socket-ticket
// authMiddleware já garantiu req.user.id via JWT. O ticket é o que o
// cliente manda no "identificar" do Socket.IO — de vida curta (30s) e
// só serve pra isso, então mesmo vazando não dá pra reusar como sessão.
exports.getSocketTicket = async (req, res) => {
  try {
    const ticket = emitirTicket(req.user.id);
    return res.status(200).json({ status: "success", data: { ticket } });
  } catch (error) {
    console.error("Erro ao emitir ticket de socket:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    // Só id/username — é usado pra montar a lista de "iniciar conversa"
    // nas mensagens (frontend nem lê os outros campos). E-mail de todo
    // usuário cadastrado não devia vazar aqui.
    const users = await User.findAll({
      attributes: ["id", "username"],
    });

    res.status(200).json({
      status: "success",
      data: {
        users,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar usuários." });
  }
};
