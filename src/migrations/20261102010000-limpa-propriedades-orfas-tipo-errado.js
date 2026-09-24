"use strict";

// Bug reportado com print: "Poção de Vida Média" (Consumivel) mostrando
// "Dano: 8–14 (Físico)" e "+1 Força" na Loja — sinal de que o item tem
// uma linha ÓRFÃ de WeaponProperties (provavelmente sobra de uma
// dessincronia antiga de id/sequence, tipo a que já corrigimos em
// Powers — ver 20260930420000-fix-powers-sequence.js), já que o
// frontend mostra "Dano" só quando `item.weaponProperties` existe, sem
// checar se o tipo_item bate.
//
// Limpeza geral: cada tabela de propriedades específicas só pode
// existir pro tipo_item certo. Qualquer linha que não bater é lixo de
// dado (nunca deveria existir, nenhum código de verdade cria essa
// combinação) e é removida. Idempotente — se não houver nada torto,
// não faz nada.
const TIPOS_ARMADURA = ["Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2"];

module.exports = {
  async up(queryInterface) {
    const [orfasArma] = await queryInterface.sequelize.query(
      `DELETE FROM "WeaponProperties" wp
       USING "Items" i
       WHERE wp.id_item = i.id AND i.tipo_item <> 'Arma'
       RETURNING i.nome, i.tipo_item;`,
    );
    if (orfasArma.length > 0) {
      console.log(
        `[migration] ${orfasArma.length} linha(s) órfã(s) de WeaponProperties removida(s):`,
        orfasArma.map((o) => `${o.nome} (${o.tipo_item})`).join(", "),
      );
    }

    const [orfasArmadura] = await queryInterface.sequelize.query(
      `DELETE FROM "ArmorProperties" ap
       USING "Items" i
       WHERE ap.id_item = i.id AND i.tipo_item NOT IN (:tipos)
       RETURNING i.nome, i.tipo_item;`,
      { replacements: { tipos: TIPOS_ARMADURA } },
    );
    if (orfasArmadura.length > 0) {
      console.log(
        `[migration] ${orfasArmadura.length} linha(s) órfã(s) de ArmorProperties removida(s):`,
        orfasArmadura.map((o) => `${o.nome} (${o.tipo_item})`).join(", "),
      );
    }

    const [orfasConsumivel] = await queryInterface.sequelize.query(
      `DELETE FROM consumable_properties cp
       USING "Items" i
       WHERE cp.id_item = i.id AND i.tipo_item <> 'Consumivel'
       RETURNING i.nome, i.tipo_item;`,
    );
    if (orfasConsumivel.length > 0) {
      console.log(
        `[migration] ${orfasConsumivel.length} linha(s) órfã(s) de consumable_properties removida(s):`,
        orfasConsumivel.map((o) => `${o.nome} (${o.tipo_item})`).join(", "),
      );
    }

    if (orfasArma.length === 0 && orfasArmadura.length === 0 && orfasConsumivel.length === 0) {
      console.log("[migration] Nenhuma propriedade órfã de tipo errado encontrada.");
    }
  },

  async down() {
    console.log("[migration] down() é um no-op — não há como saber os dados órfãos originais pra restaurar.");
  },
};
