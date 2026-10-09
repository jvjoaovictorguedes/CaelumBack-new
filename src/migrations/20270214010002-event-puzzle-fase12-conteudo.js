"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 12 (Conteúdo completo
// do evento / fluxo end-to-end). Até aqui só existia o ENGINE (Fases
// 2-11) — nenhuma EventDefinition/EventEdition/PuzzleBlueprint real
// chegou a ser criada fora de fixture de teste. Esta migration é o
// CONTEÚDO em si: a definição do evento, uma edição ATIVA, e as 4
// salas em ordem (Oficina dos Eixos → Observatório → Sala das Marés →
// Núcleo da Convergência), cada uma com sua PuzzleBlueprintVersion
// PUBLISHED.
//
// As topologias (`components`/`connections`/`objectives`) são
// EXATAMENTE as fixtures canônicas já provadas resolvíveis pelos
// testes server-side das Fases 3/5/6/7 (puzzleMechanicalComponents.
// test.js/puzzleOpticalComponents.test.js/puzzleHydraulicComponents.
// test.js/puzzleConvergenceComponents.test.js) — nunca reinventadas
// aqui. A GOLDEN SOLUTION de cada uma continua existindo SÓ nesses
// arquivos de teste (nunca nesta migration, nunca em config, nunca em
// DTO público) — ver puzzleBlueprintService.dtoPublicoLayout, que filtra
// objectives pra {id, descricao} e nunca expõe `condicao`.
//
// `position` (layout x/y pro frontend desenhar, Fase 4/16) é
// adicionado aqui — o engine nunca lê esse campo (puro, sem DOM/
// coordenadas), é só o Admin/conteúdo autorando onde cada peça aparece
// na cena.
const CELL = 140;
function pos(col, row) {
  return { x: col * CELL, y: row * CELL };
}

function configOficinaDosEixos() {
  return {
    dominio: "MECANICO",
    titulo_publico: "Oficina dos Eixos",
    descricao_publica:
      "A primeira câmara do Coração: um labirinto de engrenagens, correias e uma alavanca cerimonial. Ligue o motor e acerte a transmissão até a saída girar na velocidade e sentido certos.",
    dificuldade: "FACIL",
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 120, sentido: "CW" }, position: pos(0, 1) },
      { id: "gear1", type: "GEAR", props: { dentes: 20 }, position: pos(1, 1) },
      { id: "gear2", type: "GEAR", props: { dentes: 40 }, position: pos(2, 1) },
      { id: "clutch1", type: "CLUTCH", props: {}, position: pos(3, 1) },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CCW", toleranciaRpm: 0 }, position: pos(4, 1) },
      { id: "lever1", type: "LEVER", props: {}, position: pos(2, 3) },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "gear1", port: "in" } },
      { id: "c2", from: { componentId: "gear1", port: "out" }, to: { componentId: "gear2", port: "in" } },
      { id: "c3", from: { componentId: "gear2", port: "out" }, to: { componentId: "clutch1", port: "in" } },
      { id: "c4", from: { componentId: "clutch1", port: "out" }, to: { componentId: "output1", port: "in" } },
    ],
    objectives: [
      { id: "obj_rotacao", descricao: "Atingir a rotação de saída", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } },
      { id: "obj_alavanca", descricao: "Acionar a alavanca cerimonial", condicao: { op: "EQUALS", path: "components.lever1.acionada", value: true } },
    ],
  };
}

function configObservatorio() {
  return {
    dominio: "OPTICO",
    titulo_publico: "Observatório / Prisma da Aurora",
    descricao_publica:
      "Um feixe de luz branca atravessa o Prisma da Aurora e se divide em cores. Guie cada raio — espelhos, lentes e um obturador — até os receptores certos, na cor e intensidade exigidas.",
    dificuldade: "MEDIO",
    components: [
      { id: "emitter1", type: "EMITTER", props: { intensidade: 100, cor: "BRANCO" }, position: pos(0, 1) },
      { id: "prism1", type: "PRISM", props: {}, position: pos(1, 1) },
      { id: "mirror1", type: "MIRROR", props: {}, position: pos(2, 0) },
      { id: "lens1", type: "LENS", props: { fator: 0.5 }, position: pos(3, 0) },
      { id: "shutter1", type: "SHUTTER", props: {}, position: pos(4, 0) },
      { id: "receiver1", type: "RECEIVER", props: { corAlvo: "VERMELHO", intensidadeAlvo: 50, toleranciaIntensidade: 0 }, position: pos(5, 0) },
      { id: "receiver2", type: "RECEIVER", props: { corAlvo: "VERDE", intensidadeAlvo: 100, toleranciaIntensidade: 0 }, position: pos(2, 2) },
    ],
    connections: [
      { id: "c1", from: { componentId: "emitter1", port: "out" }, to: { componentId: "prism1", port: "in" } },
      { id: "c2", from: { componentId: "prism1", port: "VERMELHO" }, to: { componentId: "mirror1", port: "in" } },
      { id: "c3", from: { componentId: "mirror1", port: "out" }, to: { componentId: "lens1", port: "in" } },
      { id: "c4", from: { componentId: "lens1", port: "out" }, to: { componentId: "shutter1", port: "in" } },
      { id: "c5", from: { componentId: "shutter1", port: "out" }, to: { componentId: "receiver1", port: "in" } },
      { id: "c6", from: { componentId: "prism1", port: "VERDE" }, to: { componentId: "receiver2", port: "in" } },
    ],
    objectives: [
      { id: "obj_vermelho", descricao: "Focar o feixe vermelho no receptor", condicao: { op: "EQUALS", path: "components.receiver1.atingido", value: true } },
      { id: "obj_verde", descricao: "Canal verde do prisma atingido", condicao: { op: "EQUALS", path: "components.receiver2.atingido", value: true } },
    ],
  };
}

function configSalaDasMares() {
  return {
    dominio: "HIDRAULICO",
    titulo_publico: "Sala das Marés",
    descricao_publica:
      "Canais de água represada alimentam uma turbina e um reservatório cerimonial. Abra as válvulas certas pra atingir a vazão da turbina — e deixar o reservatório transbordar de propósito.",
    dificuldade: "MEDIO",
    components: [
      { id: "pump1", type: "PUMP", props: { vazaoNominal: 100 }, position: pos(0, 1) },
      { id: "pipe1", type: "PIPE", props: { vazaoMaxima: 60 }, position: pos(1, 1) },
      { id: "valve1", type: "VALVE", props: {}, position: pos(2, 1) },
      { id: "pressure1", type: "PRESSURE_NODE", props: { fatorPressao: 2 }, position: pos(3, 1) },
      { id: "turbine1", type: "TURBINE", props: { vazaoAlvo: 60, toleranciaVazao: 0 }, position: pos(4, 1) },
      { id: "reservoir1", type: "RESERVOIR", props: { capacidade: 80 }, position: pos(1, 3) },
    ],
    connections: [
      { id: "c1", from: { componentId: "pump1", port: "out" }, to: { componentId: "pipe1", port: "in" } },
      { id: "c2", from: { componentId: "pipe1", port: "out" }, to: { componentId: "valve1", port: "in" } },
      { id: "c3", from: { componentId: "valve1", port: "out" }, to: { componentId: "pressure1", port: "in" } },
      { id: "c4", from: { componentId: "pressure1", port: "out" }, to: { componentId: "turbine1", port: "in" } },
      { id: "c5", from: { componentId: "pump1", port: "out2" }, to: { componentId: "reservoir1", port: "in" } },
    ],
    objectives: [
      { id: "obj_turbina", descricao: "Atingir a vazão alvo da turbina", condicao: { op: "EQUALS", path: "components.turbine1.atingido", value: true } },
      { id: "obj_transbordamento", descricao: "Transbordar o reservatório", condicao: { op: "EQUALS", path: "components.reservoir1.transbordando", value: true } },
    ],
  };
}

function configNucleoDaConvergencia() {
  return {
    dominio: "CONVERGENCIA",
    titulo_publico: "Núcleo da Convergência",
    descricao_publica:
      "A câmara final do Coração: transmissão mecânica, feixe de energia e fluxo hidráulico, cada um com seu próprio terminal — mas o verdadeiro objetivo é sincronizar os três ao mesmo tempo.",
    dificuldade: "DIFICIL",
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 60, sentido: "CW" }, position: pos(0, 0) },
      { id: "clutch1", type: "CLUTCH", props: {}, position: pos(1, 0) },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: pos(2, 0) },
      { id: "emitter1", type: "EMITTER", props: { intensidade: 40, cor: "AZUL" }, position: pos(0, 2) },
      { id: "shutter1", type: "SHUTTER", props: {}, position: pos(1, 2) },
      { id: "receiver1", type: "RECEIVER", props: { corAlvo: "AZUL", intensidadeAlvo: 40, toleranciaIntensidade: 0 }, position: pos(2, 2) },
      { id: "pump1", type: "PUMP", props: { vazaoNominal: 20 }, position: pos(0, 4) },
      { id: "valve1", type: "VALVE", props: {}, position: pos(1, 4) },
      { id: "turbine1", type: "TURBINE", props: { vazaoAlvo: 20, toleranciaVazao: 0 }, position: pos(2, 4) },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "clutch1", port: "in" } },
      { id: "c2", from: { componentId: "clutch1", port: "out" }, to: { componentId: "output1", port: "in" } },
      { id: "c3", from: { componentId: "emitter1", port: "out" }, to: { componentId: "shutter1", port: "in" } },
      { id: "c4", from: { componentId: "shutter1", port: "out" }, to: { componentId: "receiver1", port: "in" } },
      { id: "c5", from: { componentId: "pump1", port: "out" }, to: { componentId: "valve1", port: "in" } },
      { id: "c6", from: { componentId: "valve1", port: "out" }, to: { componentId: "turbine1", port: "in" } },
    ],
    objectives: [
      { id: "obj_transmissao", descricao: "Resolver a transmissão mecânica", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } },
      { id: "obj_energia", descricao: "Resolver o feixe de energia", condicao: { op: "EQUALS", path: "components.receiver1.atingido", value: true } },
      { id: "obj_hidraulica", descricao: "Resolver o fluxo hidráulico", condicao: { op: "EQUALS", path: "components.turbine1.atingido", value: true } },
      {
        id: "obj_convergencia",
        descricao: "Sincronizar os três sistemas ao mesmo tempo",
        condicao: {
          op: "AND",
          conditions: [
            { op: "EQUALS", path: "components.output1.atingido", value: true },
            { op: "EQUALS", path: "components.receiver1.atingido", value: true },
            { op: "EQUALS", path: "components.turbine1.atingido", value: true },
          ],
        },
      },
    ],
  };
}

// key, nome, ordem, prerequisito (índice na própria lista, resolvido
// depois de inserir), config.
const SALAS = [
  { key: "oficina-dos-eixos", nome: "Oficina dos Eixos", ordem: 1, config: configOficinaDosEixos() },
  { key: "observatorio", nome: "Observatório", ordem: 2, config: configObservatorio() },
  { key: "sala-das-mares", nome: "Sala das Marés", ordem: 3, config: configSalaDasMares() },
  { key: "nucleo-da-convergencia", nome: "Núcleo da Convergência", ordem: 4, config: configNucleoDaConvergencia() },
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [[definicao]] = await queryInterface.sequelize.query(
        `INSERT INTO event_definitions (key, nome, descricao, status, metadata, "createdAt", "updatedAt")
         VALUES (:key, :nome, :descricao, 'PUBLISHED', '{}'::jsonb, NOW(), NOW())
         RETURNING id;`,
        {
          replacements: {
            key: "coracao-da-maquina-celestial",
            nome: "O Coração da Máquina Celestial",
            descricao:
              "Um autômato ancestral desperta sob a cidade. Resolva as câmaras mecânica, óptica e hidráulica, e sincronize-as no Núcleo da Convergência pra restaurar o Coração.",
          },
          transaction: t,
        },
      );

      const [[edicao]] = await queryInterface.sequelize.query(
        `INSERT INTO event_editions (id_event_definition, key, nome, status, starts_at, ends_at, metadata, "createdAt", "updatedAt")
         VALUES (:idDefinicao, :key, :nome, 'ACTIVE', NOW(), NULL, '{}'::jsonb, NOW(), NOW())
         RETURNING id;`,
        {
          replacements: {
            idDefinicao: definicao.id,
            key: "primeira-convergencia",
            nome: "Primeira Convergência",
          },
          transaction: t,
        },
      );

      let idBlueprintAnterior = null;
      for (const sala of SALAS) {
        const [[blueprint]] = await queryInterface.sequelize.query(
          `INSERT INTO puzzle_blueprints (id_event_definition, key, nome, descricao, ordem, id_blueprint_prerequisito, "createdAt", "updatedAt")
           VALUES (:idDefinicao, :key, :nome, :descricao, :ordem, :idPrerequisito, NOW(), NOW())
           RETURNING id;`,
          {
            replacements: {
              idDefinicao: definicao.id,
              key: sala.key,
              nome: sala.nome,
              descricao: sala.config.descricao_publica,
              ordem: sala.ordem,
              idPrerequisito: idBlueprintAnterior,
            },
            transaction: t,
          },
        );

        await queryInterface.sequelize.query(
          `INSERT INTO puzzle_blueprint_versions (id_blueprint, version, status, config, published_at, published_by_admin_id, "createdAt", "updatedAt")
           VALUES (:idBlueprint, 1, 'PUBLISHED', :config, NOW(), NULL, NOW(), NOW());`,
          {
            replacements: { idBlueprint: blueprint.id, config: JSON.stringify(sala.config) },
            transaction: t,
          },
        );

        // Fase 9 — uma pista de sabor por sala, desbloqueada ao
        // concluir o primeiro objective declarado.
        await queryInterface.sequelize.query(
          `INSERT INTO puzzle_clue_definitions (id_blueprint, key, titulo, texto, trigger_type, objective_id, ordem, "createdAt", "updatedAt")
           VALUES (:idBlueprint, 'fragmento-de-lore', :titulo, :texto, 'OBJECTIVE_COMPLETED', :objectiveId, 0, NOW(), NOW());`,
          {
            replacements: {
              idBlueprint: blueprint.id,
              titulo: `Fragmento de lore — ${sala.nome}`,
              texto: `Um fragmento gravado na pedra fala sobre a construção de "${sala.nome}", séculos antes da cidade existir.`,
              objectiveId: sala.config.objectives[0].id,
            },
            transaction: t,
          },
        );

        // Fase 10 — pódio de 3 por sala comum, 1 posição só pro Núcleo
        // (o feito mais raro do evento).
        await queryInterface.sequelize.query(
          `INSERT INTO puzzle_pioneer_milestones (id_blueprint, key, titulo, descricao, trigger_type, objective_id, max_claims, ordem, "createdAt", "updatedAt")
           VALUES (:idBlueprint, 'primeiro-a-resolver', :titulo, :descricao, 'INSTANCE_COMPLETED', NULL, :maxClaims, 0, NOW(), NOW());`,
          {
            replacements: {
              idBlueprint: blueprint.id,
              titulo: `Pioneiro de ${sala.nome}`,
              descricao: `Um dos primeiros aventureiros a resolver por completo "${sala.nome}".`,
              maxClaims: sala.key === "nucleo-da-convergencia" ? 1 : 3,
            },
            transaction: t,
          },
        );

        idBlueprintAnterior = blueprint.id;
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [definicoes] = await queryInterface.sequelize.query(
        `SELECT id FROM event_definitions WHERE key = 'coracao-da-maquina-celestial';`,
        { transaction: t },
      );
      for (const definicao of definicoes) {
        const [blueprints] = await queryInterface.sequelize.query(
          `SELECT id FROM puzzle_blueprints WHERE id_event_definition = :id;`,
          { replacements: { id: definicao.id }, transaction: t },
        );
        const idsBlueprints = blueprints.map((b) => b.id);
        if (idsBlueprints.length) {
          await queryInterface.sequelize.query(
            `DELETE FROM puzzle_pioneer_claims WHERE id_milestone IN (SELECT id FROM puzzle_pioneer_milestones WHERE id_blueprint IN (:ids));`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(
            `DELETE FROM puzzle_pioneer_milestones WHERE id_blueprint IN (:ids);`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(
            `DELETE FROM character_clue_unlocks WHERE id_clue_definition IN (SELECT id FROM puzzle_clue_definitions WHERE id_blueprint IN (:ids));`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(
            `DELETE FROM puzzle_clue_definitions WHERE id_blueprint IN (:ids);`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(
            `DELETE FROM puzzle_participants WHERE id_instance IN (SELECT pi.id FROM puzzle_instances pi JOIN puzzle_blueprint_versions v ON v.id = pi.id_blueprint_version WHERE v.id_blueprint IN (:ids));`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(
            `DELETE FROM puzzle_instances WHERE id_blueprint_version IN (SELECT id FROM puzzle_blueprint_versions WHERE id_blueprint IN (:ids));`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(
            `UPDATE puzzle_blueprints SET id_blueprint_prerequisito = NULL WHERE id IN (:ids);`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(
            `DELETE FROM puzzle_blueprint_versions WHERE id_blueprint IN (:ids);`,
            { replacements: { ids: idsBlueprints }, transaction: t },
          );
          await queryInterface.sequelize.query(`DELETE FROM puzzle_blueprints WHERE id IN (:ids);`, {
            replacements: { ids: idsBlueprints },
            transaction: t,
          });
        }
        await queryInterface.sequelize.query(`DELETE FROM event_editions WHERE id_event_definition = :id;`, {
          replacements: { id: definicao.id },
          transaction: t,
        });
      }
      await queryInterface.sequelize.query(
        `DELETE FROM event_definitions WHERE key = 'coracao-da-maquina-celestial';`,
        { transaction: t },
      );
    });
  },
};
