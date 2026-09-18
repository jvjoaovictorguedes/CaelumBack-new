"use strict";

// Balanceamento: dano_min/dano_max das armas do catálogo eram baixos
// demais pra quem já está em nível alto — o dano BASE da arma soma
// direto com bônus de força/nível na fórmula (calcularDanoBasico,
// combatFormulas.js), então uma arma Comum com dano_max ~6-9 deixava o
// ataque básico de um personagem nível 40+ travado numa fatia pequena
// e sempre igual do dano total, não importa o quanto ele evoluísse —
// e a diferença entre raridades também era pequena demais pra valer a
// pena caçar uma arma melhor. Sobe TODAS as faixas (mais na base, pra
// quem ainda não tem uma arma boa não ficar tão para trás, e mais no
// topo, pra Lendário/Mítico valerem a caça).
//
// UPDATE em vez de reseed: isso já é jogo em produção, com jogadores de
// verdade tendo armas equipadas — rodar reseed-itens-producao.js de novo
// apagaria o inventário/equipamento de todo mundo (ver aviso no topo
// daquele script). Uma migration ajusta os números nas MESMAS linhas
// (por nome do item), sem mexer em quem já tem o quê.
module.exports = {
  async up(queryInterface) {
    const atualizacoes = [
      { nome: "Adaga Enferrujada", dano_min: 5, dano_max: 10 },
      { nome: "Espada de Ferro", dano_min: 8, dano_max: 14 },
      { nome: "Cajado do Aprendiz", dano_min: 5, dano_max: 9 },
      { nome: "Espada Curta de Bronze", dano_min: 6, dano_max: 11 },
      { nome: "Machado de Batalha", dano_min: 13, dano_max: 22 },
      { nome: "Adaga das Sombras", dano_min: 11, dano_max: 18 },
      { nome: "Cajado Sussurrante", dano_min: 10, dano_max: 16 },
      { nome: "Lança do Guardião", dano_min: 22, dano_max: 32 },
      { nome: "Espada Élfica", dano_min: 21, dano_max: 30 },
      { nome: "Orbe de Cristal", dano_min: 19, dano_max: 28 },
      { nome: "Machado Rúnico", dano_min: 24, dano_max: 35 },
      { nome: "Machado Brutal do Orc", dano_min: 35, dano_max: 50 },
      { nome: "Cajado do Arquimago", dano_min: 32, dano_max: 44 },
      { nome: "Lança Perfurante do Abismo", dano_min: 33, dano_max: 48 },
      { nome: "Espada do Rei Adormecido", dano_min: 50, dano_max: 70 },
      { nome: "Cajado das Mil Tempestades", dano_min: 46, dano_max: 65 },
      { nome: "Fragmento da Lâmina Celestial", dano_min: 75, dano_max: 100 },
    ];

    for (const { nome, dano_min, dano_max } of atualizacoes) {
      const [, linhasAfetadas] = await queryInterface.sequelize.query(
        `UPDATE "WeaponProperties"
         SET dano_min = :dano_min, dano_max = :dano_max
         WHERE id_item = (SELECT id FROM "Items" WHERE nome = :nome LIMIT 1);`,
        { replacements: { nome, dano_min, dano_max } },
      );
      if (!linhasAfetadas) {
        console.log(`[migration] Arma "${nome}" não encontrada no catálogo atual — pulando.`);
      }
    }
  },

  async down() {
    console.log(
      "[migration] down() de balanceamento é intencionalmente um no-op (não faz sentido reverter pra valores desbalanceados).",
    );
  },
};
