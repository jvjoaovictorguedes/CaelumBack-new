"use strict";

// Bug reportado: "alguns equipamentos e itens estão sem fotos". Não
// existe arte de verdade pronta pra esses (diferente dos lotes
// anteriores de backfill, que usavam PNGs entregues pelo usuário) — o
// usuário pediu ícones simples gerados por código mesmo, só pra parar
// de aparecer vazio/emoji, com possibilidade de trocar por arte real
// depois (só substituir o arquivo, sem mexer em banco).
//
// Cobre os 3 blocos que ficaram sem imagem_url:
//  1. Os 192 itens "<Peça> Forjado(a) de <Minério>" de
//     20260930400000-forge-blueprints-todos-minerios.js (a migration
//     que os criou esqueceu de setar imagem_url) — ícone por
//     peça×minério, reaproveitado nas 6 qualidades.
//  2. Os 3 Pergaminhos (Aprimoramento/Mestre Ferreiro/Forja Celestial).
//  3. Os 6 Espólios nomeados que os lotes de backfill anteriores
//     (20261026710000/770000/790000) documentaram como "sem imagem
//     entregue": Bolsa de Saque Goblin, Coração Berserker, Coração da
//     Alcateia, Escama Dracônica Reforçada, Insígnia Goblin, Presa do
//     Chefe Orc.
//  4. QUALQUER Item tipo_item='Material' ainda sem imagem_url (a
//     migration original de materiais grava '' — string vazia, não
//     NULL) — casado por palavra-chave no nome pra um arquétipo de
//     ícone (presa/minério/couro/escama/gema/fragmento/chama), tingido
//     pela raridade do próprio item; sem correspondência cai no
//     arquétipo "gem" (fallback seguro, nunca deixa Material sem
//     nenhuma imagem).
//
// Idempotente: só atualiza quem estiver com imagem_url NULL ou ''.
const BASE = "/images/equipamentos/gerados";

const EQUIP_SHAPE_POR_PECA = { Espada: "sword", Cajado: "staff", Peitoral: "chestplate", Anel: "ring" };
const MINERAIS = ["Ferro", "Cobre", "Prata", "Ouro", "Cristal de Mana", "Obsidiana", "Astralita", "Minério Celestial"];

const ESPOLIOS_SEM_ARTE = {
  "Bolsa de Saque Goblin": "espolio-bolsa-saque-goblin.png",
  "Coração Berserker": "espolio-coracao-berserker.png",
  "Coração da Alcateia": "espolio-coracao-da-alcateia.png",
  "Escama Dracônica Reforçada": "espolio-escama-draconica-reforcada.png",
  "Insígnia Goblin": "espolio-insignia-goblin.png",
  "Presa do Chefe Orc": "espolio-presa-chefe-orc.png",
};

const PERGAMINHOS = {
  "Pergaminho do Aprimoramento": "pergaminho-aprimoramento.png",
  "Pergaminho do Mestre Ferreiro": "pergaminho-mestre-ferreiro.png",
  "Pergaminho da Forja Celestial": "pergaminho-forja-celestial.png",
};

// Ordem importa — primeira palavra-chave que bater no nome vence.
const ARQUETIPO_POR_PALAVRA_CHAVE = [
  [/presa|dente|garra/i, "fang"],
  [/min[ée]rio|placa|a[çc]o/i, "ore"],
  [/couro|fio/i, "hide"],
  [/escama/i, "scale"],
  [/cora[çc][ãa]o/i, "heart"],
  [/n[úu]cleo|fragmento|ess[êe]ncia/i, "shard"],
  [/fagulha|brasa|chama/i, "flame"],
  [/p[óo]|gema|cristal/i, "gem"],
];

function arquetipoPorNome(nome) {
  for (const [regex, arquetipo] of ARQUETIPO_POR_PALAVRA_CHAVE) {
    if (regex.test(nome)) return arquetipo;
  }
  return "gem";
}

module.exports = {
  async up(queryInterface) {
    let total = 0;

    // 1) Itens forjados por minério
    for (const [peca, shape] of Object.entries(EQUIP_SHAPE_POR_PECA)) {
      for (const mineral of MINERAIS) {
        const slug = mineral.toLowerCase().replace(/ /g, "-");
        const imagem = `${BASE}/forjado-${shape}-${slug}.png`;
        const [resultado] = await queryInterface.sequelize.query(
          `UPDATE "Items" SET imagem_url = :imagem
           WHERE nome LIKE :padrao AND (imagem_url IS NULL OR imagem_url = '')
           RETURNING id;`,
          // "Forjad%" (não "Forjado%") porque Espada usa "Forjada" e as
          // outras 3 peças usam "Forjado" — só "Forjad" é comum às duas.
          { replacements: { imagem, padrao: `${peca} Forjad% de ${mineral} —%` } },
        );
        total += resultado.length;
      }
    }

    // 2) Pergaminhos
    for (const [nome, arquivo] of Object.entries(PERGAMINHOS)) {
      const [resultado] = await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem
         WHERE nome = :nome AND (imagem_url IS NULL OR imagem_url = '')
         RETURNING id;`,
        { replacements: { nome, imagem: `${BASE}/${arquivo}` } },
      );
      total += resultado.length;
    }

    // 3) Espólios nomeados sem arte entregue
    for (const [nome, arquivo] of Object.entries(ESPOLIOS_SEM_ARTE)) {
      const [resultado] = await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem
         WHERE nome = :nome AND (imagem_url IS NULL OR imagem_url = '')
         RETURNING id;`,
        { replacements: { nome, imagem: `${BASE}/${arquivo}` } },
      );
      total += resultado.length;
    }

    // 4) Qualquer Material ainda sem imagem — casado por palavra-chave,
    // tingido pela raridade do próprio item.
    const [materiaisSemImagem] = await queryInterface.sequelize.query(
      `SELECT id, nome, raridade FROM "Items"
       WHERE tipo_item = 'Material' AND (imagem_url IS NULL OR imagem_url = '');`,
    );
    for (const material of materiaisSemImagem) {
      const arquetipo = arquetipoPorNome(material.nome);
      const raridade = (material.raridade || "Comum").toLowerCase();
      const imagem = `${BASE}/material-${arquetipo}-${raridade}.png`;
      await queryInterface.sequelize.query(`UPDATE "Items" SET imagem_url = :imagem WHERE id = :id;`, {
        replacements: { imagem, id: material.id },
      });
      total += 1;
    }

    console.log(`[migration] Ícone gerado aplicado em ${total} item(ns) sem foto.`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE imagem_url LIKE '/images/equipamentos/gerados/%';`,
    );
  },
};
