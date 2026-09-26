"use strict";

// Reformulação "Sistema de Monstros, Stats Fixos" — fase BACKFILL
// (§11.3). Fotografia de migração: converte o estado atual (multiplicador
// + sorteio de nível por zona) num nível/stats FIXOS únicos por
// monstro, usando a MESMA fórmula que combatController.gerarInimigo já
// usa hoje (statsDeReferenciaPorNivel + vidaMaximaDe/danoBasicoEsperado
// de combatFormulas.js), só que com variação=1 (determinística, sem
// RNG) — pra equivalência inicial, nunca um rebalanceamento novo
// (§16.1 "não confundir backfill com novo design").
//
// Fórmulas reproduzidas aqui (não importadas dos services reais) pelo
// mesmo motivo que outras migrations de dados deste repositório já
// hardcodam a fórmula do momento em vez de importar do service atual:
// o service pode mudar no futuro, mas esta migration precisa
// reproduzir exatamente o cálculo de HOJE pra ser uma conversão fiel.
//
// Nível: pra cada AdventureMonster, olha TODOS os vínculos ativos em
// AdventureZoneMonster + a AdventureZone de cada um, calcula a faixa
// efetiva (override do vínculo, senão a faixa da zona) e usa o
// midpoint arredondado do vínculo de MENOR id como nível de transição
// (determinístico). Se houver mais de uma faixa distinta entre os
// vínculos do mesmo monstro, registra o conflito no log em vez de
// adivinhar qual está "certa" — só usa a do vínculo de menor id.
// Monstro sem nenhum vínculo ativo (nunca apareceu em zona nenhuma)
// recebe nível 1 (sem base pra calcular outra coisa).
module.exports = {
  async up(queryInterface) {
    const VIDA_BASE_POR_NIVEL = 5;
    const DANO_FISICO_BASE_POR_NIVEL = 0.6;
    const DANO_MAGICO_BASE_POR_NIVEL = 0.6;
    const ATRIBUTO_REFERENCIA_BASE = 2;
    const ATRIBUTO_REFERENCIA_POR_NIVEL = 0.8;

    function statsDeReferenciaPorNivel(nivel) {
      const nivelValido = Math.max(1, nivel || 1);
      const atributo = Math.round(ATRIBUTO_REFERENCIA_BASE + ATRIBUTO_REFERENCIA_POR_NIVEL * (nivelValido - 1));
      return { nivel: nivelValido, forca: atributo, vitalidade: atributo, agilidade: atributo, velocidade: atributo, inteligencia: atributo };
    }
    function bonusPorNivel(ref, baseNivel) {
      return Math.max(0, ref.nivel - 1) * baseNivel;
    }
    function vidaMaximaDe(ref) {
      return Math.round(30 + ref.vitalidade * 6 + bonusPorNivel(ref, VIDA_BASE_POR_NIVEL));
    }
    function danoBasicoEsperado(ref) {
      const fisico = 4 + ref.forca * 0.9 + bonusPorNivel(ref, DANO_FISICO_BASE_POR_NIVEL);
      const magico = 4 + ref.inteligencia * 0.5 + bonusPorNivel(ref, DANO_MAGICO_BASE_POR_NIVEL);
      return Math.max(fisico, magico);
    }

    await queryInterface.sequelize.transaction(async (transaction) => {
      const [monstros] = await queryInterface.sequelize.query(
        `SELECT id, nome, multiplicador_vida, multiplicador_dano, multiplicador_agilidade, multiplicador_velocidade
         FROM "AdventureMonsters" WHERE nivel IS NULL;`,
        { transaction },
      );

      const [vinculos] = await queryInterface.sequelize.query(
        `SELECT zm.id, zm.id_monstro, zm.tipo_aparicao,
                COALESCE(zm.nivel_min_override, z.nivel_monstro_min) AS nivel_min,
                COALESCE(zm.nivel_max_override, z.nivel_monstro_max) AS nivel_max
         FROM "AdventureZoneMonsters" zm
         JOIN "AdventureZones" z ON z.id = zm.id_area
         WHERE zm.ativo = true
         ORDER BY zm.id_monstro, zm.id;`,
        { transaction },
      );

      const vinculosPorMonstro = new Map();
      for (const v of vinculos) {
        if (!vinculosPorMonstro.has(v.id_monstro)) vinculosPorMonstro.set(v.id_monstro, []);
        vinculosPorMonstro.get(v.id_monstro).push(v);
      }

      const relatorio = { totalConvertidos: 0, semVinculo: 0, comConflito: [] };

      for (const monstro of monstros) {
        const meusVinculos = vinculosPorMonstro.get(monstro.id) ?? [];
        let nivel;

        if (meusVinculos.length === 0) {
          nivel = 1;
          relatorio.semVinculo += 1;
        } else {
          const faixasDistintas = new Set(meusVinculos.map((v) => `${v.nivel_min}-${v.nivel_max}`));
          if (faixasDistintas.size > 1) {
            relatorio.comConflito.push({ id: monstro.id, nome: monstro.nome, faixas: [...faixasDistintas] });
          }
          // Vínculo de menor id (já ordenado acima) — determinístico.
          const principal = meusVinculos[0];
          nivel = Math.round((principal.nivel_min + principal.nivel_max) / 2);
        }

        const referencia = statsDeReferenciaPorNivel(nivel);
        const multVida = monstro.multiplicador_vida ?? 1;
        const multDano = monstro.multiplicador_dano ?? 1;
        const multAgi = monstro.multiplicador_agilidade ?? 1;
        const multVel = monstro.multiplicador_velocidade ?? 1;

        const vidaMaxima = Math.max(20, Math.round(vidaMaximaDe(referencia) * multVida));
        const danoBase = Math.max(1, Math.round(danoBasicoEsperado(referencia) * multDano));
        const agilidade = Math.max(1, Math.round(referencia.agilidade * multAgi));
        const velocidade = Math.max(1, Math.round(referencia.velocidade * multVel));

        // Intervalo de dano explícito a partir da média esperada —
        // sugestão provisória do documento (§11.3.4): preserva
        // aproximadamente a dispersão que a variação de spawn (±10%/±15%)
        // dava, sem ela existir mais.
        const danoMin = Math.max(0, Math.floor(danoBase * 0.85));
        const danoMax = Math.max(danoMin, Math.ceil(danoBase * 1.15));

        const xpRecompensa = 15 + nivel * 8;
        const ouroRecompensa = 5 + nivel * 4;
        // Raro (§7.1) recebe o mesmo 3x que a fórmula antiga aplicava —
        // só nesta fotografia; a partir daqui recompensa é autoral.
        const ehRaro = meusVinculos.some((v) => v.tipo_aparicao === "Raro");
        const xpFinal = ehRaro ? xpRecompensa * 3 : xpRecompensa;
        const ouroFinal = ehRaro ? ouroRecompensa * 3 : ouroRecompensa;

        await queryInterface.sequelize.query(
          `UPDATE "AdventureMonsters"
           SET nivel = :nivel, vida_maxima = :vidaMaxima, dano_min = :danoMin, dano_max = :danoMax,
               agilidade = :agilidade, velocidade = :velocidade, xp_recompensa = :xpFinal, ouro_recompensa = :ouroFinal
           WHERE id = :id;`,
          { replacements: { nivel, vidaMaxima, danoMin, danoMax, agilidade, velocidade, xpFinal, ouroFinal, id: monstro.id }, transaction },
        );
        relatorio.totalConvertidos += 1;
      }

      // eslint-disable-next-line no-console -- auditoria da migration (§11.3.6), precisa aparecer no log de deploy
      console.log(
        `[migration monstros-backfill] convertidos=${relatorio.totalConvertidos} sem_vinculo=${relatorio.semVinculo} conflitos=${relatorio.comConflito.length}`,
      );
      if (relatorio.comConflito.length > 0) {
        // eslint-disable-next-line no-console
        console.log("[migration monstros-backfill] monstros com faixas de nível conflitantes entre zonas (usado o vínculo de menor id):", JSON.stringify(relatorio.comConflito));
      }
    });
  },

  async down(queryInterface) {
    // Fotografia de migração (§16.1) — down() só limpa os campos novos,
    // mesmo espírito do down() da fase Expand.
    await queryInterface.sequelize.query(
      `UPDATE "AdventureMonsters" SET nivel = NULL, vida_maxima = NULL, dano_min = NULL, dano_max = NULL, agilidade = NULL, velocidade = NULL, xp_recompensa = NULL, ouro_recompensa = NULL;`,
    );
  },
};
