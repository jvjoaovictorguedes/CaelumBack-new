const LABELS = {
  nome: "Nome",
  descricao: "Descrição",
  dano_base: "Dano base",
  cura_base: "Cura base",
  custo_mana: "Custo de mana",
  cooldown: "Cooldown (turnos)",
  escala_atributo: "Atributo de escalamento",
  valor_escala: "Coeficiente de escalamento",
  usage_scope: "Disponibilidade",
  preco: "Preço",
  raridade: "Raridade",
  nivel: "Nível",
  vida: "Vida",
  vida_maxima: "Vida máxima",
  dano_min: "Dano mínimo",
  dano_max: "Dano máximo",
  xp_recompensa: "XP de recompensa",
  ouro_recompensa: "Ouro de recompensa",
  vida_base: "Vida global",
  defesa: "Defesa",
  forca: "Força",
  agilidade: "Agilidade",
  inteligencia: "Inteligência",
  velocidade: "Velocidade",
  combat_duration_seconds: "Prazo do Boss (segundos)",
  ativo: "Disponível",
};
const FIELDS = {
  Power: [
    "nome",
    "descricao",
    "dano_base",
    "cura_base",
    "custo_mana",
    "cooldown",
    "escala_atributo",
    "valor_escala",
    "usage_scope",
  ],
  Item: ["nome", "descricao", "preco", "raridade"],
  AdventureMonster: [
    "nome",
    "nivel",
    "vida_maxima",
    "dano_min",
    "dano_max",
    "defesa",
    "agilidade",
    "velocidade",
    "xp_recompensa",
    "ouro_recompensa",
    "ativo",
  ],
  WorldBossConfig: [
    "nome",
    "vida_base",
    "defesa",
    "nivel",
    "combat_duration_seconds",
    "ativo",
  ],
};
function clean(value, max = 500) {
  return String(value ?? "—")
    .replace(/@/g, "＠")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .slice(0, max);
}
function diff(entity, before, after) {
  if (!before || !after) return [];
  return (FIELDS[entity] || [])
    .filter(
      (k) =>
        Object.hasOwn(before, k) &&
        Object.hasOwn(after, k) &&
        JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    )
    .map((k) => ({
      field: k,
      label: LABELS[k] || k,
      before: before[k],
      after: after[k],
    }));
}
function changeText(change) {
  return `${clean(change.name, 150)}\n${change.diff.map((d) => `${d.label}: ${clean(d.before, 180)} → ${clean(d.after, 180)}`).join("\n")}`;
}
function patchVisible(note, day = new Date().toISOString().slice(0, 10)) {
  return (
    note.status === "Publicado" ||
    (note.status === "Agendado" && note.publicado_em <= day)
  );
}
function changePayload(change) {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: clean(`Balanceamento — ${change.name}`, 250),
        description: changeText(change).slice(0, 3800),
        color: 0xf3b43f,
        footer: {
          text: `Caelum · ${change.release_env} · alteração #${change.id}`,
        },
      },
    ],
  };
}
function patchPayload(note, environment) {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: clean(`${note.versao} — ${note.titulo}`, 250),
        description: clean(note.descricao, 3800),
        color: 0xf3b43f,
        footer: { text: `Caelum · ${environment} · patch #${note.id}` },
      },
    ],
  };
}
module.exports = {
  FIELDS,
  LABELS,
  clean,
  diff,
  changeText,
  patchVisible,
  changePayload,
  patchPayload,
};
