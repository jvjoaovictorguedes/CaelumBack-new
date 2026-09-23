"use strict";

// Adiciona 3 novos sets de equipamentos para a Forja:
// - Alto Julgador (Guerreiro)
// - Arcano Carmesim (Mago)
// - Carrasco (Guerreiro)
// Cada set tem 4 itens (arma + armadura/capacete + botas/sapatos + manto/acessório).

const EQUIPAMENTO_SETS = [
  {
    nome_set: "Alto Julgador",
    tipo: "Guerreiro",
    items: [
      {
        nome: "Espada do Alto Julgador",
        tipo_item: "Arma",
        tipo_propriedade: "Weapon",
        weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" },
        dano_base: { min: 12, max: 18 },
        raridade: "Raro",
        valor_venda: 400,
      },
      {
        nome: "Elmo do Alto Julgador",
        tipo_item: "Capacete",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Capacete" },
        defesa_base: 6,
        raridade: "Raro",
        valor_venda: 350,
      },
      {
        nome: "Manto do Alto Julgador",
        tipo_item: "Armadura",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Torso" },
        defesa_base: 10,
        raridade: "Raro",
        valor_venda: 500,
      },
      {
        nome: "Botas do Alto Julgador",
        tipo_item: "Armadura",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Pes" },
        defesa_base: 4,
        raridade: "Raro",
        valor_venda: 300,
      },
    ],
  },
  {
    nome_set: "Arcano Carmesim",
    tipo: "Mago",
    items: [
      {
        nome: "Cajado Arcano Carmesim",
        tipo_item: "Arma",
        tipo_propriedade: "Weapon",
        weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" },
        dano_base: { min: 10, max: 15 },
        raridade: "Raro",
        valor_venda: 420,
      },
      {
        nome: "Elmo Arcano Carmesim",
        tipo_item: "Capacete",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Capacete" },
        defesa_base: 4,
        raridade: "Raro",
        valor_venda: 320,
      },
      {
        nome: "Manto Arcano Carmesim",
        tipo_item: "Armadura",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Torso" },
        defesa_base: 7,
        raridade: "Raro",
        valor_venda: 450,
      },
      {
        nome: "Sapato Arcano Carmesim",
        tipo_item: "Armadura",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Pes" },
        defesa_base: 3,
        raridade: "Raro",
        valor_venda: 280,
      },
    ],
  },
  {
    nome_set: "Carrasco",
    tipo: "Guerreiro",
    items: [
      {
        nome: "Trituradora de Ossos",
        tipo_item: "Arma",
        tipo_propriedade: "Weapon",
        weapon: { tipo_arma: "Machado", tipo_dano: "Fisico", bonus_atributo: "Forca" },
        dano_base: { min: 14, max: 20 },
        raridade: "Épico",
        valor_venda: 650,
      },
      {
        nome: "Elmo do Carrasco",
        tipo_item: "Capacete",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Capacete" },
        defesa_base: 8,
        raridade: "Épico",
        valor_venda: 550,
      },
      {
        nome: "Armadura do Carrasco",
        tipo_item: "Armadura",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Torso" },
        defesa_base: 14,
        raridade: "Épico",
        valor_venda: 750,
      },
      {
        nome: "Botas do Carrasco",
        tipo_item: "Armadura",
        tipo_propriedade: "Armor",
        armor: { slot_equipamento: "Pes" },
        defesa_base: 6,
        raridade: "Épico",
        valor_venda: 450,
      },
    ],
  },
];

module.exports = {
  async up(queryInterface) {
    for (const set of EQUIPAMENTO_SETS) {
      for (const item_template of set.items) {
        // Verificar se item já existe
        const [[existe]] = await queryInterface.sequelize.query(
          `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: item_template.nome } },
        );

        if (existe) {
          console.log(`[migration] Item "${item_template.nome}" já existe — pulando.`);
          continue;
        }

        // Gerar path da imagem (usando o nome do item com .png)
        const imagemPath = `/images/equipamentos/${item_template.nome}.png`;

        // Criar item
        const [[item_criado]] = await queryInterface.sequelize.query(
          `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, imagem_url, disponivel_loja, "createdAt", "updatedAt")
           VALUES (:nome, :descricao, :tipo_item, :raridade, 0, :valor_venda, 1, :imagem_url, false, now(), now())
           RETURNING id;`,
          {
            replacements: {
              nome: item_template.nome,
              descricao: `${item_template.nome} — equipamento do set ${set.nome_set} do tipo ${set.tipo}.`,
              tipo_item: item_template.tipo_item,
              raridade: item_template.raridade,
              valor_venda: item_template.valor_venda,
              imagem_url: imagemPath,
            },
          },
        );

        const id_item = item_criado.id;

        // Adicionar propriedades (Weapon ou Armor)
        if (item_template.tipo_propriedade === "Weapon") {
          const escala = { "Raro": 2, "Épico": 3, "Lendário": 4.5 }[item_template.raridade] || 1;
          const dano_min = Math.round(item_template.dano_base.min * escala);
          const dano_max = Math.round(item_template.dano_base.max * escala);

          await queryInterface.sequelize.query(
            `INSERT INTO "WeaponProperties" (id_item, dano_min, dano_max, tipo_dano, tipo_arma, bonus_atributo, valor_bonus_atributo, "createdAt", "updatedAt")
             VALUES (:id_item, :dano_min, :dano_max, :tipo_dano, :tipo_arma, :bonus_atributo, :valor_bonus, now(), now());`,
            {
              replacements: {
                id_item,
                dano_min,
                dano_max,
                tipo_dano: item_template.weapon.tipo_dano,
                tipo_arma: item_template.weapon.tipo_arma,
                bonus_atributo: item_template.weapon.bonus_atributo,
                valor_bonus: Math.round(2 * escala * 10) / 10,
              },
            },
          );
        } else {
          const escala = { "Raro": 2, "Épico": 3, "Lendário": 4.5 }[item_template.raridade] || 1;
          const defesa = Math.round(item_template.defesa_base * escala);

          await queryInterface.sequelize.query(
            `INSERT INTO "ArmorProperties" (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_inteligencia, bonus_agilidade, bonus_velocidade, "createdAt", "updatedAt")
             VALUES (:id_item, :slot, :defesa, 0, :bonus_vit, 0, 0, 0, now(), now());`,
            {
              replacements: {
                id_item,
                slot: item_template.armor.slot_equipamento,
                defesa,
                bonus_vit: Math.round(1.5 * escala),
              },
            },
          );
        }

        console.log(`[migration] Item "${item_template.nome}" criado com sucesso.`);
      }
    }
  },

  async down(queryInterface) {
    for (const set of EQUIPAMENTO_SETS) {
      for (const item_template of set.items) {
        await queryInterface.sequelize.query(
          `DELETE FROM "Items" WHERE nome = :nome;`,
          { replacements: { nome: item_template.nome } },
        );
      }
    }
  },
};
