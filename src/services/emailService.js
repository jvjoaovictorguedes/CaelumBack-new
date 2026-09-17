
// Serviço de envio de e-mails transacionais usando Resend.
// Atualmente utilizado para redefinição de senha.
//
// Variáveis de ambiente necessárias:
//
// RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
// RESEND_FROM=Caelum <noreply@seudominio.com>
//
// A RESEND_API_KEY deve existir SOMENTE no backend.
// Nunca coloque essa chave no frontend ou em variáveis NEXT_PUBLIC_*.

const { Resend } = require("resend");

let resendClient = null;

function resendConfigurado() {
  return Boolean(
    process.env.RESEND_API_KEY && process.env.RESEND_FROM
  );
}

function obterResend() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY não configurada.");
    }

    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

async function enviarEmailRedefinicaoSenha({ paraEmail, link }) {
  // Se o Resend não estiver configurado, não derruba
  // o fluxo de redefinição de senha.
  //
  // Em desenvolvimento/staging, o link continua disponível
  // no log do backend para facilitar os testes.

  if (!resendConfigurado()) {
    console.warn(
      "[email] Resend não configurado — e-mail de redefinição de senha NÃO foi enviado de verdade."
    );

    console.warn(
      `[email] Link de redefinição para ${paraEmail}: ${link}`
    );

    return {
      enviado: false,
    };
  }

  const resend = obterResend();

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: [paraEmail],
      subject: "Redefinição de senha — Caelum",

      text: `Recebemos um pedido para redefinir sua senha.

Se foi você, clique no link abaixo para redefinir sua senha:

${link}

Este link é válido por 30 minutos.

Se você não pediu uma redefinição de senha, pode ignorar este e-mail. Sua senha continuará a mesma.`,

      html: `
        <div style="
          font-family: Arial, Helvetica, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 32px;
          color: #222;
        ">
          <h2 style="margin-bottom: 24px;">
            Redefinição de senha
          </h2>

          <p>
            Recebemos um pedido para redefinir sua senha.
          </p>

          <p>
            Se foi você, clique no botão abaixo para definir uma nova senha:
          </p>

          <p style="margin: 32px 0;">
            <a
              href="${link}"
              style="
                display: inline-block;
                padding: 12px 24px;
                background-color: #111827;
                color: #ffffff;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
              "
            >
              Redefinir minha senha
            </a>
          </p>

          <p>
            Ou copie e cole o link abaixo no seu navegador:
          </p>

          <p style="
            word-break: break-all;
            font-size: 14px;
            color: #666;
          ">
            ${link}
          </p>

          <p>
            Este link é válido por <strong>30 minutos</strong>.
          </p>

          <p style="
            margin-top: 32px;
            color: #666;
            font-size: 14px;
          ">
            Se você não pediu uma redefinição de senha,
            pode ignorar este e-mail. Sua senha continuará a mesma.
          </p>

          <hr style="
            margin: 32px 0;
            border: none;
            border-top: 1px solid #eee;
          ">

          <p style="
            color: #999;
            font-size: 12px;
          ">
            Este é um e-mail automático do Caelum.
            Por favor, não responda a esta mensagem.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error(
        "[email] Erro retornado pelo Resend:",
        error
      );

      return {
        enviado: false,
        erro: error,
      };
    }

    console.log(
      `[email] E-mail de redefinição enviado para ${paraEmail}. ID: ${data?.id || "N/A"}`
    );

    return {
      enviado: true,
      id: data?.id,
    };
  } catch (erro) {
    console.error(
      "[email] Erro ao enviar e-mail de redefinição:",
      erro
    );

    return {
      enviado: false,
      erro,
    };
  }
}

module.exports = {
  enviarEmailRedefinicaoSenha,
  resendConfigurado,
};