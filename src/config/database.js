// src/config/database.js
const { Sequelize } = require("sequelize");
require("dotenv").config();

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const useSsl = process.env.DB_SSL === "true";
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

const connectDB = async () => {
  let delay = 2000;

  while (true) {
    try {
      await sequelize.authenticate();
      console.log("Conexão com o banco de dados estabelecida com sucesso.");
      await sequelize.sync({ alter: true });
      console.log("Modelos sincronizados com o banco de dados.");
      return;
    } catch (error) {
      console.error(
        `Não foi possível conectar ao banco de dados. Nova tentativa em ${delay / 1000}s:`,
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
};

module.exports = { sequelize, connectDB };
