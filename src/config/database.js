// src/config/database.js
const { Sequelize } = require("sequelize");
// Sequelize carrega o driver do dialect (`dialect: "postgres"` abaixo)
// via require() DINÂMICO a partir da string do dialect — o bundler de
// função serverless da Vercel (@vercel/nft) faz análise ESTÁTICA de
// dependências e não enxerga esse require dinâmico, então `pg` fica de
// fora do pacote da função e a Vercel derruba com "please install pg
// package manually" mesmo com `pg` instalado normalmente em
// node_modules. Este require explícito e estático força o bundler a
// incluir o pacote — inofensivo em qualquer outro ambiente (Railway,
// local), já que o Sequelize ia carregar o mesmo módulo de qualquer
// jeito.
require("pg");
require("dotenv").config();

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const useSsl = process.env.DB_SSL === "true";
const databaseSource = databaseUrl
  ? "DATABASE_URL/POSTGRES_URL"
  : "DB_*/PG* variables";
// max:10 esgotava de verdade sob carga concorrente real — validado com
// teste de carga local (20 "jogadores" simultâneos repetindo o ciclo
// completo de combate via HTTP contra o backend real): com max:10, as
// ações de combate chegavam a 30-40s (batendo exatamente no timeout de
// acquire abaixo — fila de conexão esgotada); com max:15, o mesmo teste
// não passou de ~10s em um único pico isolado, e o throughput geral
// subiu ~6x. max:25 deu ganho só marginal sobre 15, então fica o valor
// mais conservador. O Postgres gerenciado de produção aceita até 500
// conexões (`SHOW max_connections`), então 15 tem folga enorme — não é
// o teto do Postgres que limitava, era só este número da aplicação.
// DB_POOL_MAX permite ajustar sem novo deploy se precisar.
const databaseOptions = {
  dialect: "postgres",
  logging: false,
  pool: {
    max: Number(process.env.DB_POOL_MAX) || 15,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  ...(useSsl && {
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  }),
};

if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
  // Falha rápido com uma mensagem clara em vez de deixar o Sequelize
  // estourar um erro genérico (ou pior: um erro fora de try/catch que
  // derruba o processo sem dizer por quê nos logs do Railway).
  console.error(
    `DATABASE_URL/POSTGRES_URL não parece uma URL do Postgres válida (deveria começar com "postgres://" ou "postgresql://"). Valor recebido: "${databaseUrl.slice(0, 15)}...".`,
  );
  process.exit(1);
}

const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      ...databaseOptions,
    })
  : new Sequelize(
      process.env.DB_NAME || process.env.PGDATABASE || "gamerpg",
      process.env.DB_USER || process.env.PGUSER || "postgres",
      process.env.DB_PASSWORD || process.env.PGPASSWORD || "",
      {
        ...databaseOptions,
        host: process.env.DB_HOST || process.env.PGHOST || "localhost",
        port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
      },
    );

let databaseReady = false;

const connectDB = async () => {
  let delay = 2000;

  try {
    const databaseConfig = databaseUrl
      ? new URL(databaseUrl)
      : {
          hostname: process.env.DB_HOST || process.env.PGHOST || "localhost",
          port: process.env.DB_PORT || process.env.PGPORT || 5432,
        };

    console.log(
      `Banco configurado via ${databaseSource}: ${databaseConfig.hostname}:${databaseConfig.port}`,
    );
  } catch (error) {
    console.error(
      "Não foi possível interpretar a configuração do banco (só afeta a mensagem de log, não impede a conexão):",
      error.message,
    );
  }

  while (true) {
    try {
      await sequelize.authenticate();
      console.log("Conexão com o banco de dados estabelecida com sucesso.");
      // NUNCA `alter: true` aqui — isso rodava sozinho, sem confirmação
      // nenhuma, TODA VEZ que o servidor subia (todo deploy, todo
      // restart), comparando os models atuais com o banco e tentando
      // "corrigir" a diferença na hora. Pra colunas ENUM (ex:
      // natureza_magica) o Sequelize faz isso recriando o tipo inteiro,
      // e é um processo conhecidamente frágil no Postgres — em caso de
      // divergência entre o que o banco tinha e o que o model esperava,
      // dava pra perder dado de verdade sem ninguém ter pedido. Schema
      // agora é sempre por migration (`npm run migrate`), nunca
      // automático.
      //
      // Em produção nem o `sync()` sem opções roda: schema em produção é
      // 100% responsabilidade das migrations (`npm run migrate`), rodadas
      // explicitamente no deploy — nunca implicitamente no boot do
      // processo. Fora de produção (dev/test) continua criando tabela que
      // ainda não existe, sem tocar em tabela/coluna já existente.
      if (process.env.NODE_ENV === "production") {
        console.log("Ambiente de produção: sincronização automática de schema desativada (use as migrations).");
      } else {
        await sequelize.sync();
        console.log("Modelos sincronizados com o banco de dados.");
      }
      databaseReady = true;
      return;
    } catch (error) {
      databaseReady = false;
      console.error(
        `Não foi possível conectar ao banco de dados. Nova tentativa em ${delay / 1000}s:`,
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
};

module.exports = { sequelize, connectDB, isDatabaseReady: () => databaseReady };
