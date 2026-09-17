// Envio de e-mail transacional (hoje só "esqueci minha senha"). Usa
// SMTP genérico via nodemailer — funciona com qualquer provedor
// (SendGrid, Mailgun, SES, Gmail com senha de app, etc.), configurado
// só por variável de ambiente, sem acoplar a um provedor específico.
//
// SMTP_HOST ausente é tratado como "e-mail não configurado ainda": em
// vez de derrubar o fluxo (ou pior, fingir que enviou), loga o link de
// reset no console do servidor. Isso deixa o fluxo utilizável em
// dev/staging antes de configurar um provedor de verdade, mas span
// PRECISA de SMTP_HOST configurado em produção pra realmente entregar o
// e-mail — sem isso, o "esqueci minha senha" nunca chega na caixa de
// entrada de ninguém.
const nodemailer = require("nodemailer");

let transporterCache = null;

function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST);
}

function obterTransporter() {
  if (transporterCache) return transporterCache;

  transporterCache = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    // SMTP_SECURE=true pra porta 465 (SSL direto); por padrão usa
    // STARTTLS (porta 587), que é o mais comum entre provedores.
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  return transporterCache;
}

async function enviarEmailRedefinicaoSenha({ paraEmail, link }) {
  if (!smtpConfigurado()) {
    console.warn(
      "[email] SMTP_HOST não configurado — e-mail de redefinição de senha NÃO foi enviado de verdade. " +
        `Link de redefinição (válido por tempo limitado) pra ${paraEmail}: ${link}`,
    );
    return { enviado: false };
  }

  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER;

  await obterTransporter().sendMail({
    from: remetente,
    to: paraEmail,
    subject: "Redefinição de senha — Caelum",
    text: `Recebemos um pedido para redefinir sua senha. Se foi você, clique no link abaixo (válido por 30 minutos):\n\n${link}\n\nSe você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.`,
    html: `
      <p>Recebemos um pedido para redefinir sua senha.</p>
      <p>Se foi você, clique no link abaixo (válido por 30 minutos):</p>
      <p><a href="${link}">${link}</a></p>
      <p>Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>
    `,
  });

  return { enviado: true };
}

module.exports = { enviarEmailRedefinicaoSenha, smtpConfigurado };
