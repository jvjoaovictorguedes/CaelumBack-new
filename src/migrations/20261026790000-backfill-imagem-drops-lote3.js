"use strict";

// Terceiro lote de imagens de drop entregue pelo usuário — 57 arquivos
// de public/images/drops/ batem por nome EXATO com Items "Espolio" que
// já existiam sem imagem_url (nunca foram cobertos pelos backfills
// anteriores: 20261026710000, 20261026720000, 20261026770000). Mesmo
// padrão: só preenche imagem_url, não cria nada novo.
//
// Ficam de fora deste lote (não entram aqui de propósito):
//  - 5 arquivos sem nenhum Item correspondente (possível arte solta/
//    nome divergente sem mapeamento óbvio): "Coração de Lobo Alfa.png",
//    "Coração do Lobo Sombrio.png", "Insígnia de Mercenário.png",
//    "Página do Tomo Proibido.png", "Saco de Veneno Concentrado.png".
//  - 6 Items "Espolio" que continuam sem nenhuma imagem entregue:
//    "Bolsa de Saque Goblin", "Coração Berserker", "Coração da Alcateia",
//    "Escama Dracônica Reforçada", "Insígnia Goblin", "Presa do Chefe Orc".
const IMAGENS_POR_ITEM_ESPOLIO = [
  { nome: "Asa Cristalina", imagem: "/images/drops/Asa Cristalina.png" },
  { nome: "Brasão Corrompido", imagem: "/images/drops/Brasão Corrompido.png" },
  { nome: "Braçadeira de Couro", imagem: "/images/drops/Braçadeira de Couro.png" },
  { nome: "Carapaça Carbonizada", imagem: "/images/drops/Carapaça Carbonizada.png" },
  { nome: "Carapaça Pétrea", imagem: "/images/drops/Carapaça Pétrea.png" },
  { nome: "Cauda de Rato", imagem: "/images/drops/Cauda de Rato.png" },
  { nome: "Chifre de Minotauro Ancestral", imagem: "/images/drops/Chifre de Minotauro Ancestral.png" },
  { nome: "Cinza Elemental", imagem: "/images/drops/Cinza Elemental.png" },
  { nome: "Coleira Reforçada", imagem: "/images/drops/Coleira Reforçada.png" },
  { nome: "Coração Amaldiçoado", imagem: "/images/drops/Coração Amaldiçoado.png" },
  { nome: "Coração Dracônico de Obsidiana", imagem: "/images/drops/Coração Dracônico de Obsidiana.png" },
  { nome: "Coração Rúnico Perfeito", imagem: "/images/drops/Coração Rúnico Perfeito.png" },
  { nome: "Coração Rúnico Superior", imagem: "/images/drops/Coração Rúnico Superior.png" },
  { nome: "Coração do Labirinto", imagem: "/images/drops/Coração do Labirinto.png" },
  { nome: "Couro de Guerra Orc", imagem: "/images/drops/Couro de Guerra Orc.png" },
  { nome: "Couro de Javali", imagem: "/images/drops/Couro de Javali.png" },
  { nome: "Couro de Minotauro", imagem: "/images/drops/Couro de Minotauro.png" },
  { nome: "Couro de Ogro", imagem: "/images/drops/Couro de Ogro.png" },
  { nome: "Dente de Ogro", imagem: "/images/drops/Dente de Ogro.png" },
  { nome: "Dente de Roedor", imagem: "/images/drops/Dente de Roedor.png" },
  { nome: "Dente de Troll", imagem: "/images/drops/Dente de Troll.png" },
  { nome: "Escama Jovem de Dragão", imagem: "/images/drops/Escama Jovem de Dragão.png" },
  { nome: "Escama Lamacenta", imagem: "/images/drops/Escama Lamacenta.png" },
  { nome: "Escama de Hidra", imagem: "/images/drops/Escama de Hidra.png" },
  { nome: "Escama de Obsidiana", imagem: "/images/drops/Escama de Obsidiana.png" },
  { nome: "Essência Cinzenta", imagem: "/images/drops/Essência Cinzenta.png" },
  { nome: "Essência Espectral", imagem: "/images/drops/Essência Espectral.png" },
  { nome: "Ferrão de Escorpião", imagem: "/images/drops/Ferrão de Escorpião.png" },
  { nome: "Fio Mineral", imagem: "/images/drops/Fio Mineral.png" },
  { nome: "Fivela Saqueada", imagem: "/images/drops/Fivela Saqueada.png" },
  { nome: "Flecha Quebrada", imagem: "/images/drops/Flecha Quebrada.png" },
  { nome: "Fragmento Rúnico", imagem: "/images/drops/Fragmento Rúnico.png" },
  { nome: "Fragmento de Armadura", imagem: "/images/drops/Fragmento de Armadura.png" },
  { nome: "Fragmento de Armadura Negra", imagem: "/images/drops/Fragmento de Armadura Negra.png" },
  { nome: "Fragmento de Sentinela", imagem: "/images/drops/Fragmento de Sentinela.png" },
  { nome: "Garra Curva", imagem: "/images/drops/Garra Curva.png" },
  { nome: "Garra Draconídea", imagem: "/images/drops/Garra Draconídea.png" },
  { nome: "Glândula Regenerativa", imagem: "/images/drops/Glândula Regenerativa.png" },
  { nome: "Glândula Tóxica", imagem: "/images/drops/Glândula Tóxica.png" },
  { nome: "Glândula de Veneno", imagem: "/images/drops/Glândula de Veneno.png" },
  { nome: "Glândula Ígnea", imagem: "/images/drops/Glândula Ígnea.png" },
  { nome: "Insígnia Mercenária", imagem: "/images/drops/Insígnia Mercenária.png" },
  { nome: "Lenço de Saqueador", imagem: "/images/drops/Lenço de Saqueador.png" },
  { nome: "Núcleo Incandescente", imagem: "/images/drops/Núcleo Incandescente.png" },
  { nome: "Núcleo Rúnico Ancestral", imagem: "/images/drops/Núcleo Rúnico Ancestral.png" },
  { nome: "Núcleo de Lodo", imagem: "/images/drops/Núcleo de Lodo.png" },
  { nome: "Núcleo de Pedra Rúnica", imagem: "/images/drops/Núcleo de Pedra Rúnica.png" },
  { nome: "Pele Úmida", imagem: "/images/drops/Pele Úmida.png" },
  { nome: "Placa Rúnica", imagem: "/images/drops/Placa Rúnica.png" },
  { nome: "Placa Óssea", imagem: "/images/drops/Placa Óssea.png" },
  { nome: "Presa de Orc", imagem: "/images/drops/Presa de Orc.png" },
  { nome: "Selo do Capitão", imagem: "/images/drops/Selo do Capitão.png" },
  { nome: "Tecido Ritual", imagem: "/images/drops/Tecido Ritual.png" },
  { nome: "Teia de Aranha Venenosa", imagem: "/images/drops/Teia de Aranha Venenosa.png" },
  { nome: "Totem de Guerra Orc", imagem: "/images/drops/Totem de Guerra Orc.png" },
  { nome: "Véu Espectral", imagem: "/images/drops/Véu Espectral.png" },
  { nome: "Véu Mortuário", imagem: "/images/drops/Véu Mortuário.png" },
];

module.exports = {
  async up(queryInterface) {
    let atualizados = 0;
    for (const { nome, imagem } of IMAGENS_POR_ITEM_ESPOLIO) {
      const [[item]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome AND tipo_item = 'Espolio' LIMIT 1;`,
        { replacements: { nome } },
      );
      if (!item) {
        console.log(`[migration] Item Espólio "${nome}" não encontrado — pulando.`);
        continue;
      }
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem WHERE id = :id;`,
        { replacements: { id: item.id, imagem } },
      );
      atualizados += 1;
    }
    console.log(`[migration] Imagem aplicada em ${atualizados} Item(ns) Espólio existente(s).`);
  },

  async down(queryInterface) {
    const nomes = IMAGENS_POR_ITEM_ESPOLIO.map((i) => i.nome);
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE nome IN (${nomes.map(() => "?").join(",")}) AND tipo_item = 'Espolio';`,
      { replacements: nomes },
    );
  },
};
