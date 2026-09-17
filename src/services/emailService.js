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
const dns = require("dns");
const { promisify } = require("util");

const resolve4 = promisify(dns.resolve4);

let transporterCache = null;

function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST);
}

// O nodemailer 10.x resolve o host tanto por A (IPv4) quanto AAAA (IPv6)
// e SORTEIA aleatoriamente qual endereço usar pra conectar — não tem
// nenhuma opção (`family` incluso) que force IPv4 nessa versão. Em
// ambientes sem rota de saída IPv6 (Railway, entre outros), cair no
// endereço IPv6 sorteado falha com "ENETUNREACH ...:587" antes mesmo do
// handshake SMTP começar — e como é sorteio, o próximo pedido de reset
// podia simplesmente ter sorte e funcionar, escondendo o problema.
// Resolvendo o IPv4 aqui, antes de qualquer coisa, e passando o
// endereço literal como `host`, o nodemailer nunca chega a tentar IPv6.
// `servername` mantém a validação de certificado/SNI contra o hostname
// de verdade (obrigatório: conectar direto num IP sem isso falha a
// verificação do certificado TLS do Gmail).
async function resolverEnderecoIPv4(host) {
  if (dns.isIP(host)) return host;
  try {
    const enderecos = await resolve4(host);
    return enderecos[0] || host;
  } catch (erro) {
    console.warn(
      `[email] Não foi possível resolver IPv4 de ${host} (${erro.message}) — tentando com o hostname original.`,
    );
    return host;
  }
}

async function obterTransporter() {
  if (transporterCache) return transporterCache;

  const hostOriginal = process.env.SMTP_HOST;
  const enderecoIPv4 = await resolverEnderecoIPv4(hostOriginal);

  transporterCache = nodemailer.createTransport({
    host: enderecoIPv4,
    servername: hostOriginal,
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

  const transporter = await obterTransporter();
  await transporter.sendMail({
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
