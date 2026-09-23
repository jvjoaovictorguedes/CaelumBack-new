// Resolve/cria o User a partir de um perfil Google JÁ VERIFICADO (ver
// googleAuthService.verificarIdTokenGoogle) — separado do controller de
// propósito, pra dar pra testar a lógica de vínculo/criação de conta
// contra um Postgres de verdade sem depender de um ID token assinado
// de verdade pelo Google (impossível forjar isso num teste
// automatizado — a assinatura é validada contra as chaves públicas
// reais do Google).
const crypto = require("crypto");
const User = require("../models/User");

function normalizarBase(texto) {
  const semAcento = (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const limpo = semAcento.replace(/[^a-zA-Z0-9_]/g, "");
  return limpo.slice(0, 40);
}

async function gerarUsernameDisponivel(nomeSugerido, email) {
  const base = normalizarBase(nomeSugerido) || normalizarBase(email.split("@")[0]) || "jogador";
  let candidato = base;
  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    const existente = await User.findOne({ where: { username: candidato } });
    if (!existente) return candidato;
    candidato = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
  }
  // Praticamente inalcançável (20 colisões seguidas), mas garante que a
  // função sempre termina com algo disponível em vez de um loop infinito.
  return `${base}${Date.now()}`;
}

// perfil = { googleId, email, nome } — já verificado por
// googleAuthService. Nunca confia num perfil não verificado: qualquer
// um poderia alegar ser dono de qualquer e-mail.
async function resolverOuCriarUsuarioGoogle(perfil) {
  let user = await User.findOne({ where: { googleId: perfil.googleId } });
  if (user) return user;

  // Já existe conta com esse e-mail (cadastro normal por senha)? O
  // Google já confirmou (email_verified, checado em
  // verificarIdTokenGoogle) que quem está logando agora é o dono desse
  // e-mail — linka a conta existente em vez de criar uma duplicata.
  user = await User.findOne({ where: { email: perfil.email } });
  if (user) {
    user.googleId = perfil.googleId;
    await user.save();
    return user;
  }

  const username = await gerarUsernameDisponivel(perfil.nome, perfil.email);
  return User.create({
    username,
    email: perfil.email,
    // Ninguém loga por senha numa conta só-Google — esse hash só existe
    // pra satisfazer a coluna NOT NULL. Aleatório de verdade (crypto),
    // não é uma senha "esquecível" nem adivinhável.
    passwordHash: crypto.randomBytes(32).toString("hex"),
    googleId: perfil.googleId,
  });
}

module.exports = { resolverOuCriarUsuarioGoogle, gerarUsernameDisponivel };
