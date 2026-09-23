// Login com Google — verifica o ID token que o botão "Sign in with
// Google" (Google Identity Services) devolve pro FRONTEND. É de
// propósito o fluxo de ID token, não o de authorization code: pra só
// autenticar login (sem pedir acesso a Gmail/Drive/etc), esse fluxo
// dispensa client_secret — a verificação aqui confere a ASSINATURA do
// token contra as chaves públicas do Google (a lib cuida da rotação
// delas sozinha) e o "audience" (aud === nosso Client ID). Sem essa
// checagem, qualquer JWT bem formado — não necessariamente emitido
// pelo Google — seria aceito como login válido.
const { OAuth2Client } = require("google-auth-library");

function clienteGoogle() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  return new OAuth2Client(clientId);
}

// Retorna null pra qualquer token inválido/não verificável (nunca
// lança pro caller decidir "401 genérico" sem vazar o motivo exato) —
// exceto quando o SERVIDOR está mal configurado (sem GOOGLE_CLIENT_ID),
// caso em que lança de propósito: isso é bug de configuração, não
// tentativa de login inválida, e não deveria virar silenciosamente
// "credencial errada" pro usuário.
async function verificarIdTokenGoogle(idToken) {
  const client = clienteGoogle();
  if (!client) {
    throw new Error("GOOGLE_CLIENT_ID não configurado no servidor.");
  }
  if (!idToken) return null;

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    return null;
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email || !payload.email_verified) return null;

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    nome: payload.name || payload.email.split("@")[0],
  };
}

module.exports = { verificarIdTokenGoogle };
