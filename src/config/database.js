// src/config/database.js
const { Sequelize } = require("sequelize");
require("dotenv").config();

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const useSsl = process.env.DB_SSL === "true";
const databaseSource = databaseUrl
  ? "DATABASE_URL/POSTGRES_URL"
  : "DB_*/PG* variables";
const databaseOptions = {
  dialect: "postgres",
  logging: false,
  pool: {
    max: 10,
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
      await sequelize.sync({ alter: true });
      console.log("Modelos sincronizados com o banco de dados.");
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
