const { EVENTOS_MUNDO, VERSAO_PROTOCOLO } = require("@caelum/world-contracts");
/** @typedef {import('@caelum/world-contracts').EntrarMundo} EntrarMundo */
/** @typedef {import('@caelum/world-contracts').IntencaoMover} IntencaoMover */
/** @typedef {import('@caelum/world-contracts').IntencaoConjurar} IntencaoConjurar */
/** @typedef {import('@caelum/world-contracts').IntencaoInteragir} IntencaoInteragir */
/** @typedef {import('@caelum/world-contracts').SnapshotMundo} SnapshotMundo */
/** @typedef {import('@caelum/world-contracts').ErroMundo} ErroMundo */
// Reservados para as próximas fases. Nenhum handler de movimento/combate
// está registrado na Fase 0; publicar um contrato não libera uma ação.
module.exports = { EVENTOS_MUNDO, VERSAO_PROTOCOLO };
