"use strict";

// Reformulação "Sistema de Monstros, Stats Fixos e Simulador de
// Balanceamento V2" — fase EXPAND (aditiva, sem mudar nenhum
// comportamento de runtime ainda). Adiciona os campos fixos novos como
// NULL, preservando as colunas antigas (multiplicador_vida/dano/
// agilidade/velocidade) e o fluxo de sorteio de nível — tudo isso só
// sai de uso no Contract, depois do Switch (combate/Party/Caçadas/
// Bestiário/Admin) estar migrado e testado.
//
// AdventureMonster.sprite_key JÁ EXISTE no schema (migrations
// 20261026430000/20261026450000/20261026470000/20261026780000) mas
// nunca foi declarado no model Sequelize — bug real e independente
// desta reformulação, corrigido junto aqui (só precisa declarar no
// model, não recriar a coluna).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const colunasMonstro = [
        ["nivel", { type: Sequelize.INTEGER, allowNull: true }],
        ["vida_maxima", { type: Sequelize.INTEGER, allowNull: true }],
        ["dano_min", { type: Sequelize.INTEGER, allowNull: true }],
        ["dano_max", { type: Sequelize.INTEGER, allowNull: true }],
        ["agilidade", { type: Sequelize.INTEGER, allowNull: true }],
        ["velocidade", { type: Sequelize.INTEGER, allowNull: true }],
        ["xp_recompensa", { type: Sequelize.INTEGER, allowNull: true }],
        ["ouro_recompensa", { type: Sequelize.INTEGER, allowNull: true }],
      ];
      for (const [nome, definicao] of colunasMonstro) {
        await queryInterface.addColumn("AdventureMonsters", nome, definicao, { transaction });
      }

      // §4.2/§4.3 — controla só ELEGIBILIDADE de aparição (jogador
      // abaixo disso não vê esse vínculo no pool ponderado), nunca o
      // nível do monstro. nivel_min_override/nivel_max_override
      // continuam existindo até o Contract (usados só pelo sorteio
      // antigo, removido no Switch).
      await queryInterface.addColumn(
        "AdventureZoneMonsters",
        "nivel_jogador_minimo",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        { transaction },
      );

      // CHECK via SQL cru (não o where-builder de addConstraint) — mesmo
      // padrão já usado pra XOR de EquipmentSetPiece (migration
      // 20261206010000): precisa comparar duas colunas entre si
      // (dano_max >= dano_min), que o builder de objeto não expressa bem.
      // Toda condição aceita NULL (campos só ficam NOT NULL no Contract).
      await queryInterface.sequelize.query(
        `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_nivel_positivo CHECK (nivel IS NULL OR nivel >= 1);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_vida_maxima_positiva CHECK (vida_maxima IS NULL OR vida_maxima >= 1);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_dano_valido CHECK (
           (dano_min IS NULL AND dano_max IS NULL) OR (dano_min >= 0 AND dano_max >= dano_min)
         );`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_agilidade_nao_negativa CHECK (agilidade IS NULL OR agilidade >= 0);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_velocidade_nao_negativa CHECK (velocidade IS NULL OR velocidade >= 0);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_xp_recompensa_nao_negativa CHECK (xp_recompensa IS NULL OR xp_recompensa >= 0);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_ouro_recompensa_nao_negativa CHECK (ouro_recompensa IS NULL OR ouro_recompensa >= 0);`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const nome of [
        "adventure_monsters_nivel_positivo",
        "adventure_monsters_vida_maxima_positiva",
        "adventure_monsters_dano_valido",
        "adventure_monsters_agilidade_nao_negativa",
        "adventure_monsters_velocidade_nao_negativa",
        "adventure_monsters_xp_recompensa_nao_negativa",
        "adventure_monsters_ouro_recompensa_nao_negativa",
      ]) {
        await queryInterface.removeConstraint("AdventureMonsters", nome, { transaction });
      }
      await queryInterface.removeColumn("AdventureZoneMonsters", "nivel_jogador_minimo", { transaction });
      for (const nome of ["nivel", "vida_maxima", "dano_min", "dano_max", "agilidade", "velocidade", "xp_recompensa", "ouro_recompensa"]) {
        await queryInterface.removeColumn("AdventureMonsters", nome, { transaction });
      }
    });
  },
};
