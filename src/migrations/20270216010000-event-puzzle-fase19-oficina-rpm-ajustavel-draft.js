"use strict";

// Evento "O Coração da Máquina Celestial" — evolução "RPM ajustável"
// (Regulador do Eixo Mestre). NUNCA edita a PuzzleBlueprintVersion
// PUBLISHED em produção (ela continua resolvível exatamente como hoje,
// com rpmNominal fixo) — isto cria uma NOVA PuzzleBlueprintVersion em
// DRAFT pra demonstrar/testar a feature em DEV, seguindo o fluxo normal
// do Admin (DRAFT → validar solvabilidade → publicar, quando/se
// decidirem substituir a atual).
//
// Baseline conceitual: mesma Oficina dos Eixos (motor → transmissão →
// saída), mas o motor agora é `ajustavel: true` e a transmissão se
// ramifica em QUATRO "Selos" independentes (cada um por uma CLUTCH
// própria), cada um exigindo uma RPM de motor DIFERENTE — nunca um
// único valor resolve os quatro (seção 15 da encomenda: "não criar
// padding"). Os quatro valores vêm de verdade da matemática de
// engrenagem/polia (GEAR→GEAR inverte+escala por dentesOrigem/
// dentesDestino; PULLEY→PULLEY escala por raioOrigem/raioDestino sem
// inverter; qualquer outro acoplamento é 1:1) — verificados rodando o
// engine real antes de escrever este arquivo, nunca "no olho":
//
//   Selo 1 — gearRaiz(20)→gear1a(40): ratio 0.5, 1 inversão (CCW).
//            motor 80 rpm -> saída 40 rpm CCW.
//   Selo 2 — gearRaiz(20)→gear2a(10)→gear2b(20): ratio 2 * 0.5 = 1,
//            2 inversões (volta a CW). motor 150 rpm -> saída 150 rpm CW.
//   Selo 3 — gearRaiz→pulley3a(30)→pulley3b(20): só polias, NUNCA
//            inverte; ratio 1.5. motor 60 (mínimo!) -> saída 90 rpm CW.
//   Selo 4 — gearRaiz(20)→gear4a(10)→pulley4a(10)→pulley4b(25):
//            ratio 2 * 1 * 0.4 = 0.8, 1 inversão (CCW).
//            motor 200 rpm -> saída 160 rpm CCW.
//
// `_seedKey` dentro do config é só uma etiqueta estável pra down()
// achar EXATAMENTE esta linha de volta, sem depender de recalcular
// `version` (que pode ter mudado se alguém publicou outra revisão
// nesse meio-tempo) — nunca lido/validado pelo engine (puzzleEngineCore
// não rejeita chaves desconhecidas em `config`, e nenhuma projeção
// pública expõe chave fora da allowlist de qualquer forma).
const SEED_KEY = "fase19-rpm-ajustavel-draft-v1";

function configOficinaRpmAjustavel() {
  return {
    _seedKey: SEED_KEY,
    dominio: "MECANICO",
    titulo_publico: "Oficina dos Eixos — Regulador do Eixo Mestre",
    descricao_publica:
      "O motor cerimonial ganhou um regulador: agora é você quem escolhe a rotação de entrada. A transmissão — engrenagens e polias — faz o resto, mas cada Selo exige um curso diferente do eixo mestre.",
    dificuldade: "MEDIO",
    components: [
      { id: "motor1", type: "MOTOR", props: { ajustavel: true, rpmInicial: 100, rpmMin: 60, rpmMax: 240, rpmStep: 10, sentido: "CW" }, position: { x: 0, y: 2 } },
      { id: "gearRaiz", type: "GEAR", props: { dentes: 20 }, position: { x: 1, y: 2 } },

      { id: "gear1a", type: "GEAR", props: { dentes: 40 }, position: { x: 2, y: 0 } },
      { id: "clutch1", type: "CLUTCH", props: {}, position: { x: 3, y: 0 } },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 40, sentidoAlvo: "CCW", toleranciaRpm: 0 }, position: { x: 4, y: 0 } },

      { id: "gear2a", type: "GEAR", props: { dentes: 10 }, position: { x: 2, y: 1 } },
      { id: "gear2b", type: "GEAR", props: { dentes: 20 }, position: { x: 3, y: 1 } },
      { id: "clutch2", type: "CLUTCH", props: {}, position: { x: 4, y: 1 } },
      { id: "output2", type: "OUTPUT", props: { rpmAlvo: 150, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: { x: 5, y: 1 } },

      { id: "pulley3a", type: "PULLEY", props: { raio: 30 }, position: { x: 2, y: 3 } },
      { id: "pulley3b", type: "PULLEY", props: { raio: 20 }, position: { x: 3, y: 3 } },
      { id: "clutch3", type: "CLUTCH", props: {}, position: { x: 4, y: 3 } },
      { id: "output3", type: "OUTPUT", props: { rpmAlvo: 90, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: { x: 5, y: 3 } },

      { id: "gear4a", type: "GEAR", props: { dentes: 10 }, position: { x: 2, y: 4 } },
      { id: "pulley4a", type: "PULLEY", props: { raio: 10 }, position: { x: 3, y: 4 } },
      { id: "pulley4b", type: "PULLEY", props: { raio: 25 }, position: { x: 4, y: 4 } },
      { id: "clutch4", type: "CLUTCH", props: {}, position: { x: 5, y: 4 } },
      { id: "output4", type: "OUTPUT", props: { rpmAlvo: 160, sentidoAlvo: "CCW", toleranciaRpm: 0 }, position: { x: 6, y: 4 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "gearRaiz", port: "in" } },

      { id: "c2", from: { componentId: "gearRaiz", port: "out" }, to: { componentId: "gear1a", port: "in" } },
      { id: "c3", from: { componentId: "gear1a", port: "out" }, to: { componentId: "clutch1", port: "in" } },
      { id: "c4", from: { componentId: "clutch1", port: "out" }, to: { componentId: "output1", port: "in" } },

      { id: "c5", from: { componentId: "gearRaiz", port: "out" }, to: { componentId: "gear2a", port: "in" } },
      { id: "c6", from: { componentId: "gear2a", port: "out" }, to: { componentId: "gear2b", port: "in" } },
      { id: "c7", from: { componentId: "gear2b", port: "out" }, to: { componentId: "clutch2", port: "in" } },
      { id: "c8", from: { componentId: "clutch2", port: "out" }, to: { componentId: "output2", port: "in" } },

      { id: "c9", from: { componentId: "gearRaiz", port: "out" }, to: { componentId: "pulley3a", port: "in" } },
      { id: "c10", from: { componentId: "pulley3a", port: "out" }, to: { componentId: "pulley3b", port: "in" } },
      { id: "c11", from: { componentId: "pulley3b", port: "out" }, to: { componentId: "clutch3", port: "in" } },
      { id: "c12", from: { componentId: "clutch3", port: "out" }, to: { componentId: "output3", port: "in" } },

      { id: "c13", from: { componentId: "gearRaiz", port: "out" }, to: { componentId: "gear4a", port: "in" } },
      { id: "c14", from: { componentId: "gear4a", port: "out" }, to: { componentId: "pulley4a", port: "in" } },
      { id: "c15", from: { componentId: "pulley4a", port: "out" }, to: { componentId: "pulley4b", port: "in" } },
      { id: "c16", from: { componentId: "pulley4b", port: "out" }, to: { componentId: "clutch4", port: "in" } },
      { id: "c17", from: { componentId: "clutch4", port: "out" }, to: { componentId: "output4", port: "in" } },
    ],
    // Descrições NUNCA revelam o número exato de RPM (seção 11 da
    // encomenda) — só pistas direcionais (curso reduzido/maior,
    // sentido, "menor sopro possível" = o mínimo do regulador,
    // "máximo vigor" = perto do máximo). Apresentação progressiva
    // (correção de lifecycle anterior) continua valendo — só o
    // objective "atual" revela a própria descrição.
    objectives: [
      {
        id: "obj_selo1",
        descricao: "O Primeiro Selo responde a um curso reduzido e contrário ao eixo mestre.",
        condicao: { op: "EQUALS", path: "components.output1.atingido", value: true },
      },
      {
        id: "obj_selo2",
        descricao: "O Segundo Selo exige fôlego maior do motor, mas no mesmo sentido do eixo mestre.",
        condicao: { op: "EQUALS", path: "components.output2.atingido", value: true },
      },
      {
        id: "obj_selo3",
        descricao: "O Terceiro Selo desperta no menor sopro possível do motor, sem inverter o curso.",
        condicao: { op: "EQUALS", path: "components.output3.atingido", value: true },
      },
      {
        id: "obj_selo4",
        descricao: "O Selo Final exige o máximo vigor do motor, revertido por engrenagens e polias em conjunto.",
        condicao: { op: "EQUALS", path: "components.output4.atingido", value: true },
      },
    ],
  };
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [[blueprint]] = await queryInterface.sequelize.query(
        `SELECT b.id FROM puzzle_blueprints b
         JOIN event_definitions d ON d.id = b.id_event_definition
         WHERE d.key = 'coracao-da-maquina-celestial' AND b.key = 'oficina-dos-eixos';`,
        { transaction: t },
      );
      if (!blueprint) throw new Error("Blueprint 'oficina-dos-eixos' não existe — rode a migration da Fase 12 primeiro.");

      const [[{ proxima_versao }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS proxima_versao FROM puzzle_blueprint_versions WHERE id_blueprint = :idBlueprint;`,
        { replacements: { idBlueprint: blueprint.id }, transaction: t },
      );

      await queryInterface.sequelize.query(
        `INSERT INTO puzzle_blueprint_versions (id_blueprint, version, status, config, published_at, published_by_admin_id, "createdAt", "updatedAt")
         VALUES (:idBlueprint, :versao, 'DRAFT', :config, NULL, NULL, NOW(), NOW());`,
        {
          replacements: { idBlueprint: blueprint.id, versao: proxima_versao, config: JSON.stringify(configOficinaRpmAjustavel()) },
          transaction: t,
        },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `DELETE FROM puzzle_blueprint_versions WHERE status = 'DRAFT' AND config->>'_seedKey' = :seedKey;`,
        { replacements: { seedKey: SEED_KEY }, transaction: t },
      );
    });
  },
};
