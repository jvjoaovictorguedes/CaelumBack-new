// Fonte única do segredo do JWT — antes userController.js e
// authMiddleware.js tinham cada um seu próprio fallback (strings
// diferentes!), então se JWT_SECRET não estivesse configurado em algum
// ambiente, token assinado por um nunca validava no outro. Também avisa
// alto no boot se está usando o fallback: qualquer um que leia esse
// arquivo (o repositório é a fonte, então isso vale mesmo sendo privado)
// consegue forjar token válido enquanto a variável de ambiente não for
// definida de verdade.
const JWT_SECRET = process.env.JWT_SECRET || "caelum-dev-only-fallback-secret-nao-use-em-producao";

if (!process.env.JWT_SECRET) {
  console.warn(
    "[auth] JWT_SECRET não está configurado — usando um segredo de desenvolvimento conhecido publicamente. " +
      "Defina a variável de ambiente JWT_SECRET com um valor aleatório e secreto antes de ir pra produção.",
  );
}

module.exports = { JWT_SECRET };
