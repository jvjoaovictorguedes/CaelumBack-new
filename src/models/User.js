const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const bcrypt = require("bcryptjs");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    dataCriacao: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    ultimoLogin: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Fluxo de "esqueci minha senha" (ver userController.forgotPassword/
    // resetPassword): só o HASH do token vai pro banco, nunca o token em
    // texto puro — se o banco vazar, ninguém consegue resetar senha de
    // ninguém só com o que está aqui. reset_password_expires limita a
    // janela de uso mesmo que o hash vaze de outro jeito.
    resetPasswordTokenHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "reset_password_token_hash",
    },
    resetPasswordExpires: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "reset_password_expires",
    },
  },
  {
    tableName: "users",
  }
);

// Roda em create E em qualquer update que troque passwordHash (registro
// normal E resetPassword) — antes só existia beforeCreate, então setar
// user.passwordHash = novaSenha num update (como resetPassword precisa
// fazer) gravava a senha NOVA em texto puro no banco, sem hash nenhum.
async function hashSenhaSeAlterada(user) {
  if (user.changed("passwordHash")) {
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
  }
}

User.beforeCreate(hashSenhaSeAlterada);
User.beforeUpdate(hashSenhaSeAlterada);

User.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = User;
