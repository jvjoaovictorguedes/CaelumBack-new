const crypto = require("crypto");
const { Op } = require("sequelize");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Character = require("../models/Character");
const { emitirTicket } = require("../services/socketTicketService");
const { enviarEmailRedefinicaoSenha } = require("../services/emailService");

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

const VALIDADE_RESET_MS = 30 * 60 * 1000; // 30 minutos

function hashToken(tokenBruto) {
  return crypto.createHash("sha256").update(tokenBruto).digest("hex");
}

// POST /api/users/forgot-password
// body: { email }
// Sempre responde a mesma mensagem genérica, exista ou não uma conta com
// esse e-mail — do contrário esse endpoint vira um jeito fácil de
// descobrir quais e-mails estão cadastrados (enumeração de usuários).
exports.forgotPassword = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Informe seu e-mail." });
    }

    const mensagemGenerica =
      "Se existir uma conta com esse e-mail, enviamos um link de redefinição de senha para ela.";

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(200).json({ status: "success", message: mensagemGenerica });
    }

    // Token em texto puro só existe em memória e no e-mail enviado — só
    // o hash dele vai pro banco (ver comentário no model User).
    const tokenBruto = crypto.randomBytes(32).toString("hex");
    user.resetPasswordTokenHash = hashToken(tokenBruto);
    user.resetPasswordExpires = new Date(Date.now() + VALIDADE_RESET_MS);
    await user.save();

    const urlFrontend = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
    const link = `${urlFrontend}/reset-password?token=${tokenBruto}`;

    try {
      await enviarEmailRedefinicaoSenha({ paraEmail: user.email, link });
    } catch (erroEmail) {
      // Não vaza pro cliente se o envio de e-mail falhou (isso também
      // permitiria inferir se o e-mail existe pela diferença de
      // comportamento) — só loga pra investigação.
      console.error("Erro ao enviar e-mail de redefinição de senha:", erroEmail);
    }

    return res.status(200).json({ status: "success", message: mensagemGenerica });
  } catch (error) {
    console.error("Erro ao solicitar redefinição de senha:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// POST /api/users/reset-password
// body: { token, password }
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "token e password são obrigatórios." });
    }

    if (password.length < SENHA_MIN_CARACTERES || !SENHA_REGEX.test(password)) {
      return res.status(400).json({
        message: `A senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres e incluir letras e números.`,
      });
    }

    const user = await User.findOne({
      where: {
        resetPasswordTokenHash: hashToken(token),
        resetPasswordExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Link de redefinição inválido ou expirado. Solicite um novo.",
      });
    }

    user.passwordHash = password; // hook beforeUpdate faz o hash
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(200).json({
      status: "success",
      message: "Senha redefinida com sucesso. Faça login com a nova senha.",
    });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ["passwordHash", "resetPasswordTokenHash", "resetPasswordExpires"] },
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
