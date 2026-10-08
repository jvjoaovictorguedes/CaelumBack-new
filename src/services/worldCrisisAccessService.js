const crisis = require("./worldCrisisService");
async function getRestriction(type, id, transaction) {
  const e = await crisis.current(transaction);
  return e
    ? (crisis
        .restrictions(e)
        .find((r) => r.target_type === type && r.target_id === Number(id)) ??
        null)
    : null;
}
async function assertAccessible(type, id, transaction) {
  const r = await getRestriction(type, id, transaction);
  if (r)
    throw Object.assign(
      new Error(
        `${r.nome || "Esta zona"} está devastada. Ajude na reconstrução para reabri-la.`,
      ),
      { status: 409, statusCode: 409, code: "WORLD_CRISIS_ZONE_BLOCKED" },
    );
}
module.exports = { getRestriction, assertAccessible };
