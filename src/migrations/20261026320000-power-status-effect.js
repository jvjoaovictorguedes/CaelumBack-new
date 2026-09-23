"use strict";

// Motor de Status (§30/§74 #1 da Especificação Consolidada Poder/Status/
// Cooldown/Balanceamento) — tabela filha de efeitos de status por
// habilidade, com backfill dos Powers legados que já tenham
// efeito_status/duracao_efeito preenchidos. NÃO apaga esses campos
// legados (§29/§74) — ficam como estão, disponíveis como fallback.
const MAPA_NOME_LEGADO_PARA_CHAVE = {
  queimadura: "BURN",
  burn: "BURN",
  sangramento: "BLEED",
  bleed: "BLEED",
  veneno: "POISON",
  poison: "POISON",
  silencio: "SILENCE",
  "silêncio": "SILENCE",
  silence: "SILENCE",
  lentidao: "SLOW",
  "lentidão": "SLOW",
  slow: "SLOW",
  enfraquecimento: "WEAKEN",
  weaken: "WEAKEN",
};

function normalizar(texto) {
  return String(texto)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (!tabelas.includes("power_status_effects")) {
      await queryInterface.createTable("power_status_effects", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_power: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Powers", key: "id" },
          onDelete: "CASCADE",
        },
        status_key: { type: Sequelize.STRING(20), allowNull: false },
        chance_ppm: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1_000_000 },
        duration_turns: { type: Sequelize.INTEGER, allowNull: false },
        potency_base: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
        potency_scale_attribute: {
          type: Sequelize.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
          allowNull: true,
        },
        potency_scale_value: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
        target: { type: Sequelize.ENUM("Self", "Enemy"), allowNull: false, defaultValue: "Enemy" },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("power_status_effects", ["id_power"]);
    }

    // Backfill: todo Power com efeito_status preenchido ganha uma linha
    // equivalente — chance 100% (comportamento implícito de hoje, onde
    // não existe sorteio de chance nenhum) e potência fixa baseada no
    // dano_base da própria habilidade (não há um campo de potência
    // separado no legado pra herdar).
    const [powersComEfeito] = await queryInterface.sequelize.query(
      `SELECT id, efeito_status, duracao_efeito, dano_base FROM "Powers" WHERE efeito_status IS NOT NULL;`,
    );
    for (const power of powersComEfeito) {
      const chave = MAPA_NOME_LEGADO_PARA_CHAVE[normalizar(power.efeito_status)];
      if (!chave) {
        console.warn(
          `[migration] Power ${power.id}: efeito_status "${power.efeito_status}" não reconhecido — nenhuma linha de backfill criada (revisar manualmente).`,
        );
        continue;
      }
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM power_status_effects WHERE id_power = :id_power AND status_key = :status_key LIMIT 1;`,
        { replacements: { id_power: power.id, status_key: chave } },
      );
      if (existente.length > 0) continue;

      await queryInterface.sequelize.query(
        `INSERT INTO power_status_effects
           (id_power, status_key, chance_ppm, duration_turns, potency_base, potency_scale_value, target, ativo, "createdAt", "updatedAt")
         VALUES
           (:id_power, :status_key, 1000000, :duration_turns, :potency_base, 0, 'Enemy', true, now(), now());`,
        {
          replacements: {
            id_power: power.id,
            status_key: chave,
            duration_turns: power.duracao_efeito ?? 2,
            potency_base: Math.max(1, Math.round((power.dano_base ?? 10) * 0.2)),
          },
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("power_status_effects");
  },
};
