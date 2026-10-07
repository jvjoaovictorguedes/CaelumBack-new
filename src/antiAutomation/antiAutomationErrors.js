const messages = {
  ACTION_REPLAYED: "Esta ação já foi processada ou reutiliza uma identificação anterior.",
  INVALID_ACTION_STATE: "Esta ação não corresponde ao estado atual. Atualize e tente novamente.",
  ACTION_RATE_LIMITED: "Muitas ações em sequência. Aguarde alguns instantes.",
  ANTI_AUTOMATION_CHALLENGE_REQUIRED: "Conclua a verificação de segurança para iniciar esta atividade.",
  ANTI_AUTOMATION_TEMPORARILY_RESTRICTED: "Esta atividade está temporariamente indisponível. Tente novamente mais tarde.",
};
function failure(code, statusCode, retryAfterMs) {
  return Object.assign(new Error(messages[code] || "Não foi possível executar esta ação agora."), {
    code, statusCode,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  });
}
function payload(error) {
  return { message: error.message, code: error.code,
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
  };
}
module.exports = { failure, payload };
