"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Habilidades",
        versao: "2.0",
        titulo: "Habilidades Passivas — 7 poderes novos pra comprar",
        descricao:
          "O jogo ganhou seu primeiro lote de poderes Passivos: um pra cada classe (Couraça de Batalha do Guerreiro, Fluxo Arcano do Mago) e um pra cada raça (Adaptação Rápida do Humano, Graça Élfica do Elfo, Pele de Granito do Anão, Sangue Selvagem do Orc, Bênção Celestial do Celestial), cada um dando um bônus permanente num atributo. Diferente dos poderes de sempre, esses não liberam de graça só por bater o nível — aparecem na aba Habilidades como \"precisa comprar\" depois de alcançar o nível mínimo, e só ficam ativos depois de gastar ouro pra aprender de verdade. Como qualquer outra habilidade, também evoluem de nível gastando ouro e Fragmento de Grimório.",
      },
      {
        feature: "Forja",
        versao: "3.3",
        titulo: "Fabricação em subseções por tipo de arma, Fundição mostra tudo",
        descricao:
          "Dentro da seção Armas da Fabricação, as receitas agora vêm organizadas por tipo (Espada, Cajado) em vez de tudo misturado. Na Fundição, todas as 6 qualidades de cada minério aparecem agora (antes só as já liberadas pelo nível de Forja apareciam) — as travadas mostram direto qual nível de Forja libera aquela qualidade, em vez de simplesmente sumir da tela.",
      },
    ];

    for (const nota of notas) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM patch_notes WHERE feature = :feature AND versao = :versao LIMIT 1;`,
        { replacements: { feature: nota.feature, versao: nota.versao } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Nota ${nota.feature} ${nota.versao} já existe — pulando.`);
        continue;
      }

      const [[{ max }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
      );

      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, :feature, :versao, :titulo, :descricao, CURRENT_DATE, now(), now());`,
        { replacements: { ordem: max + 1, ...nota } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Habilidades", versao: "2.0" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.3" });
  },
};
