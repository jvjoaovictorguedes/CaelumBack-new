"use strict";

// Painel Administrativo de Músicas §11.3 — orquestra
// musicTrackService/musicConfigService pro que o cabeçalho do módulo
// (§5.2) e a aba Slots precisam, sem duplicar as regras que já vivem
// nos dois services especializados.
const { listarSlots } = require("../config/musicSlotRegistry");
const musicConfigService = require("./musicConfigService");
const MusicAssignment = require("../models/MusicAssignment");
const MusicPoolTrackAssignment = require("../models/MusicPoolTrackAssignment");

async function obterResumo() {
  const publicada = await musicConfigService.obterVersionPublicada();
  const { draft, assignments, memberships } = await musicConfigService.obterDraftCompleto();

  let alteracoes = 0;
  if (publicada) {
    const assignmentsPublicados = await MusicAssignment.findAll({ where: { id_config_version: publicada.id } });
    const membershipsPublicados = await MusicPoolTrackAssignment.findAll({ where: { id_config_version: publicada.id } });
    const chaveAssignment = (a) => `${a.slot_key}:${a.assignment_type}:${a.id_track ?? ""}:${a.id_pool ?? ""}:${a.fade_ms ?? ""}`;
    const chaveMembership = (m) => `${m.id_pool}:${m.id_track}:${m.peso}:${m.ordem}`;

    const setPublicadoAssign = new Set(assignmentsPublicados.map(chaveAssignment));
    const setDraftAssign = new Set(assignments.map(chaveAssignment));
    const setPublicadoMember = new Set(membershipsPublicados.map(chaveMembership));
    const setDraftMember = new Set(memberships.map(chaveMembership));

    for (const v of setDraftAssign) if (!setPublicadoAssign.has(v)) alteracoes += 1;
    for (const v of setPublicadoAssign) if (!setDraftAssign.has(v)) alteracoes += 1;
    for (const v of setDraftMember) if (!setPublicadoMember.has(v)) alteracoes += 1;
    for (const v of setPublicadoMember) if (!setDraftMember.has(v)) alteracoes += 1;
  } else {
    alteracoes = assignments.length + memberships.length;
  }

  return {
    publicadaVersionNumber: publicada?.version_number ?? null,
    draftVersionNumber: draft.version_number,
    alteracoesPendentes: alteracoes,
  };
}

module.exports = { listarSlots, obterResumo };
