"use strict";

// Bug reportado: "Véu da Noite"/"Véu do Dia" contados como Acessorio1
// no Painel Administrativo — "ele é uma arma". Foram criados de
// propósito como 2 acessórios avulsos do set Equinócio (Mago) em
// 20261026760000-forge-gaia-fix-e-sets-novos.js (só ArmorProperties,
// slot Acessorio1/Acessorio2), mas o pedido explícito foi virar arma
// de verdade: Espada física, escala em Força (o schema de
// WeaponProperties só aceita UM atributo de escala por arma — igual
// toda outra espada do jogo, ver Cimitarra Vorpal/Espada Longa etc —
// não dá pra combinar Força+Agilidade no mesmo campo sem redesenhar o
// schema pra todas as armas; Força foi o escolhido).
//
// Mesma escala de poder (fatorPoder = TIER_POWER_MULTIPLIER[2] *
// RARITY_POWER_MULTIPLIER[qualidade]) já usada na migration que criou
// esses itens, aplicada a um danoBase{min:10,max:15} (mais fraco que o
// Grimório Equinócio — a arma principal do set — já que estes eram só
// acessórios extras).
//
// Idempotente: se o item já for tipo_item='Arma' com WeaponProperties,
// pula. Nunca aborta se alguém já tiver o item equipado ou anunciado no
// Mercado — desequipa e cancela automaticamente antes de trocar o tipo
// (mesmo padrão de 20261019010000-remove-manoplas-luvas.js).
const DANO_BASE = { min: 10, max: 15 };
const FATOR_POR_RARIDADE = {
  Comum: 1.95,
  Incomum: 2.0475,
  Raro: 2.145,
  Epico: 2.2815,
  Lendario: 2.4375,
  Mitico: 2.6325,
};

module.exports = {
  async up(queryInterface) {
    const [itens] = await queryInterface.sequelize.query(
      `SELECT id, nome, raridade FROM "Items"
       WHERE (nome LIKE 'Véu da Noite%' OR nome LIKE 'Véu do Dia%')
         AND tipo_item <> 'Arma';`,
    );
    if (itens.length === 0) {
      console.log('[migration] "Véu da Noite"/"Véu do Dia" já são Arma (ou não existem) — nada a fazer.');
      return;
    }
    const ids = itens.map((i) => i.id);
    console.log(`[migration] Convertendo ${itens.length} item(ns) de Véu pra Arma:`, itens.map((i) => `${i.nome} (${i.raridade})`).join(", "));

    // Desequipa automaticamente quem estiver usando como acessório —
    // o slot Acessorio1/2 não existe mais pra esses itens.
    const [desequipados] = await queryInterface.sequelize.query(
      `DELETE FROM character_equipment ce
       USING character_equipment_instances cei
       WHERE cei.id = ce.id_instancia AND cei.id_item IN (:ids)
       RETURNING ce.id_personagem;`,
      { replacements: { ids } },
    );
    if (desequipados.length > 0) {
      console.log(`[migration] Desequipado automaticamente de ${desequipados.length} personagem(ns).`);
    }

    // Cancela qualquer anúncio ativo no Mercado pelo mesmo motivo do
    // desequipe — a natureza do item (slot) está mudando.
    const [cancelados] = await queryInterface.sequelize.query(
      `UPDATE market_listings SET status = 'Cancelado'
       WHERE id_instancia IN (SELECT id FROM character_equipment_instances WHERE id_item IN (:ids))
         AND status = 'Ativo'
       RETURNING id;`,
      { replacements: { ids } },
    );
    if (cancelados.length > 0) {
      console.log(`[migration] ${cancelados.length} anúncio(s) ativo(s) no Mercado cancelado(s).`);
    }
    await queryInterface.sequelize.query(
      `UPDATE market_listings SET id_instancia = NULL
       WHERE id_instancia IN (SELECT id FROM character_equipment_instances WHERE id_item IN (:ids));`,
      { replacements: { ids } },
    );

    for (const item of itens) {
      const fator = FATOR_POR_RARIDADE[item.raridade] ?? FATOR_POR_RARIDADE.Comum;
      await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item = :id;`, {
        replacements: { id: item.id },
      });
      await queryInterface.sequelize.query(`UPDATE "Items" SET tipo_item = 'Arma' WHERE id = :id;`, {
        replacements: { id: item.id },
      });
      await queryInterface.sequelize.query(
        `INSERT INTO "WeaponProperties" (id_item, dano_min, dano_max, tipo_dano, tipo_arma, bonus_atributo, valor_bonus_atributo, "createdAt", "updatedAt")
         VALUES (:id_item, :dano_min, :dano_max, 'Fisico', 'Espada', 'Forca', :valor_bonus, now(), now());`,
        {
          replacements: {
            id_item: item.id,
            dano_min: Math.round(DANO_BASE.min * fator),
            dano_max: Math.round(DANO_BASE.max * fator),
            valor_bonus: Math.round(1 * fator),
          },
        },
      );
    }

    console.log(`[migration] ${itens.length} item(ns) de Véu convertido(s) pra Arma (Espada/Física/Força).`);
  },

  // Intencionalmente sem down() — reverter exigiria recriar dados de
  // ArmorProperties que não temos mais garantia de estarem corretos
  // (mesmo padrão de outras migrations de correção de conteúdo).
  async down() {
    console.log("[migration] down() é um no-op.");
  },
};
