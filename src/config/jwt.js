// Fonte única do segredo do JWT — antes userController.js e
// authMiddleware.js tinham cada um seu próprio fallback (strings
// diferentes!), então se JWT_SECRET não estivesse configurado em algum
// ambiente, token assinado por um nunca validava no outro.
//
// Em produção o fallback conhecido é proibido: qualquer um que leia
// este arquivo (o repositório é a fonte, então isso vale mesmo sendo
// privado) forjaria um token válido enquanto a variável de ambiente não
// estivesse definida de verdade. Em vez de subir "funcionando" com um
// segredo público, o processo nem sobe.
const emProducao = process.env.NODE_ENV === "production";

if (emProducao && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET é obrigatório em produção (NODE_ENV=production) e não pode usar um valor conhecido/padrão. " +
      "Defina a variável de ambiente JWT_SECRET com um valor aleatório e secreto antes de subir o servidor.",
  );
}

const JWT_SECRET = process.env.JWT_SECRET || "caelum-dev-only-fallback-secret-nao-use-em-producao";

if (!process.env.JWT_SECRET) {
  console.warn(
    "[auth] JWT_SECRET não está configurado — usando um segredo de desenvolvimento conhecido publicamente. " +
      "Defina a variável de ambiente JWT_SECRET com um valor aleatório e secreto antes de ir pra produção.",
  );
}

module.exports = { JWT_SECRET };
