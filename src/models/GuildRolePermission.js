const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Só guarda EXCEÇÕES à matriz padrão de permissões por cargo (ver
// services/guildPermissionService.js) — sem linha aqui, vale o default.
// Isso mantém "cargo" e "permissão" separados (cargo é só um rótulo/
// hierarquia; o que ele pode fazer é configurável por guilda) sem
// precisar de uma tabela de cargos totalmente customizáveis no MVP.
const GuildRolePermission = sequelize.define(
  "GuildRolePermission",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    cargo: {
      type: DataTypes.ENUM(
        "Fundador",
        "Oficial",
        "Veterano",
        "Membro",
        "Recruta",
      ),
      allowNull: false,
    },
    // "iniciar_portal" existia aqui pro antigo Portal de Guilda — a spec
    // "Aprimoramento do Sistema de Guildas" (§47) pede troca por
    // permissões coerentes com o Boss/Benefícios que o substituem. O
    // valor antigo continua válido no ENUM do banco (não dá pra remover
    // um valor de ENUM do Postgres sem recriar o tipo), mas o código não
    // lê/escreve mais nele a partir daqui.
    permissao: {
      type: DataTypes.ENUM(
        "convidar",
        "aceitar_candidatura",
        "expulsar",
        "promover_rebaixar",
        "editar_identidade",
        "editar_cargos",
        "autorizar_gastos",
        "liberar_boss",
        "comprar_beneficios",
      ),
      allowNull: false,
    },
    permitido: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "GuildRolePermissions",
    timestamps: false,
    indexes: [{ unique: true, fields: ["id_guild", "cargo", "permissao"] }],
  },
);

module.exports = GuildRolePermission;
