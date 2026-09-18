const crypto = require("crypto");
const { Op } = require("sequelize");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Character = require("../models/Character");
const { emitirTicket } = require("../services/socketTicketService");
const { enviarEmailRedefinicaoSenha } = require("../services/emailService");

require("dotenv").config();
const { JWT_SECRET } = require("../config/jwt");
// 1h era curto demais pra uma sessão de jogo de verdade — um jogador
// ativo que esquecia de marcar "lembrar-me" caía sem aviso no meio de
// uma partida. POST /users/refresh (abaixo) já resolve isso de vez pra
// quem continua ativo (o frontend renova sozinho em segundo plano),
// mas o valor padrão sobe mesmo assim como rede de segurança pra quem
// ficar um tempo sem interagir (aba minimizada, throttle do navegador).
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "6h";
// Usado só quando o login pede "lembrar-me" — sem isso o cookie do
// frontend dizia "7 dias" mas o token dentro dele morria em 1h de
// qualquer jeito, e "lembrar-me" nunca funcionava de verdade.
const JWT_EXPIRES_IN_REMEMBER_ME = process.env.JWT_EXPIRES_IN_REMEMBER_ME || "7d";

// "proposito" distingue um JWT de sessão normal (usado em qualquer rota
// HTTP autenticada) de outros tokens assinados com o mesmo segredo pra
// propósitos bem mais restritos — hoje só o ticket de socket (30s de
// validade, ver socketTicketService.js). Sem esse campo, um ticket de
// socket ainda válido também passava em authMiddleware como se fosse um
// JWT de sessão de verdade (jwt.verify não distingue POR QUE o token foi
// emitido, só que a assinatura bate). authMiddleware agora rejeita
// qualquer token cujo proposito não seja exatamente "session".
const PROPOSITO_SESSAO = "session";

const signToken = (id, { rememberMe = false } = {}) => {
  // rememberMe embutido no próprio payload (não só usado pra decidir a
  // duração aqui) — sem isso, POST /users/refresh (abaixo) não tinha
  // como saber se deve reemitir um token de 1h ou de 7 dias: só teria
  // acesso ao token JÁ assinado, sem contexto de qual política de
  // duração o login original escolheu.
  return jwt.sign({ id, proposito: PROPOSITO_SESSAO, rememberMe }, JWT_SECRET, {
    expiresIn: rememberMe ? JWT_EXPIRES_IN_REMEMBER_ME : JWT_EXPIRES_IN,
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
    // Usuário tentando um username/e-mail que já existe é uma entrada
    // inválida esperada, não uma falha do servidor — sem essa checagem
    // ANTES do console.error, todo registro rejeitado (o caso mais comum
    // de erro aqui) despejava o stack trace inteiro do driver do
    // Postgres/Sequelize no log, poluindo tudo com "erros" que na
    // verdade já foram tratados e responderam certo pro cliente.
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
    console.error("Erro ao registrar usuário:", error);
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
    const token = signToken(user.id, { rememberMe: Boolean(req.body.rememberMe) });

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

    // Não faz `await` aqui: o handshake SMTP pode demorar vários segundos
    // (provedor lento, TLS, etc.) e nada no fluxo de "esqueci minha senha"
    // depende do e-mail já ter saído pra responder ao cliente — travar a
    // resposta nisso só arrisca estourar o timeout do frontend e o
    // usuário achar que deu erro mesmo quando o e-mail seria enviado
    // normalmente logo em seguida. O catch continua só logando (nunca
    // vaza falha de envio pro cliente, senão dá pra inferir se o e-mail
    // existe pela diferença de comportamento).
    enviarEmailRedefinicaoSenha({ paraEmail: user.email, link }).catch((erroEmail) => {
      console.error("Erro ao enviar e-mail de redefinição de senha:", erroEmail);
    });

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
    // Invalida qualquer JWT emitido antes de agora (ver authMiddleware) —
    // sem isso, um token roubado antes do reset continuava valendo
    // normalmente até expirar sozinho, mesmo com a senha já trocada.
    user.senhaAlteradaEm = new Date();
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
// POST /users/refresh — reemite o JWT de sessão com o relógio zerado,
// mantendo a mesma política de duração (rememberMe) do login original.
// Chamado periodicamente pelo frontend enquanto o jogador está com uma
// tela do dashboard aberta (ver SessionKeepAlive.tsx) — sessão vira
// "deslizante" pra quem está de fato jogando: só quem fica realmente
// inativo (aba fechada/sem chamadas) chega a expirar de verdade.
// Exige authMiddleware — reaproveita a mesma validação de token de
// qualquer rota autenticada (assinatura, proposito, senha não trocada
// depois de emitido).
exports.refreshToken = async (req, res) => {
  try {
    const token = signToken(req.user.id, { rememberMe: Boolean(req.user.rememberMe) });
    res.status(200).json({
      status: "success",
      token,
      rememberMe: Boolean(req.user.rememberMe),
    });
  } catch (error) {
    console.error("Erro ao renovar sessão:", error);
    res.status(500).json({ message: "Erro interno do servidor ao renovar sessão." });
  }
};

// POST /api/users/change-password (autenticado)
// body: { senhaAtual, novaSenha }
// Igual ao fluxo de "esqueci minha senha" na regra de força e em marcar
// senhaAlteradaEm (derruba qualquer outro token emitido antes dessa
// troca), mas aqui o jogador já está logado e confirma a senha atual em
// vez de um link por e-mail. Reemite o token igual refreshToken faz —
// senão o PRÓPRIO token que acabou de trocar a senha ficaria inválido
// na resposta seguinte (authMiddleware compara iat com senhaAlteradaEm).
exports.changePassword = async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ message: "Informe a senha atual e a nova senha." });
    }
    if (novaSenha.length < SENHA_MIN_CARACTERES || !SENHA_REGEX.test(novaSenha)) {
      return res.status(400).json({
        message: `A nova senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres e incluir letras e números.`,
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user || !(await user.comparePassword(senhaAtual))) {
      return res.status(401).json({ message: "Senha atual incorreta." });
    }

    user.passwordHash = novaSenha; // hook beforeUpdate faz o hash
    // 1s no passado, não "agora": o token reemitido logo abaixo carrega
    // iat em segundos (truncado pra baixo pelo JWT), então um
    // senhaAlteradaEm com milissegundos "agora" podia cair DEPOIS do
    // iat do próprio token novo (mesmo segundo, truncamento pra baixo)
    // e invalidar a sessão que a troca deveria manter viva.
    user.senhaAlteradaEm = new Date(Date.now() - 1000);
    await user.save();

    const token = signToken(user.id, { rememberMe: Boolean(req.user.rememberMe) });
    res.status(200).json({
      status: "success",
      message: "Senha alterada com sucesso.",
      token,
      rememberMe: Boolean(req.user.rememberMe),
    });
  } catch (error) {
    console.error("Erro ao trocar senha:", error);
    res.status(500).json({ message: "Erro interno do servidor ao trocar a senha." });
  }
};

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
