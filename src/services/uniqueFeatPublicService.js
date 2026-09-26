// Sistema de Proezas Únicas §12/§13/§14/§17 — projeção PÚBLICA do
// domínio UniqueFeat. NUNCA retorna trigger_config, descricao_secreta_admin
// ou trigger_snapshot — só os campos que a política de revelação de cada
// Proeza permite (visibility_before_claim / reveal_after_claim).
const UniqueFeat = require("../models/UniqueFeat");
const UniqueFeatClaim = require("../models/UniqueFeatClaim");
const Power = require("../models/Power");
const uniqueFeatSocket = require("../socket/uniqueFeatSocket");

const PAGE_SIZE = 20;

// Uma claim conquistada respeita reveal_after_claim; `completo: true` é
// usado SÓ pro dono da própria conquista (perfil próprio) — ele já sabe
// tudo sobre o que venceu, o segredo protegido pela política é da
// COMUNIDADE, nunca do próprio portador.
function montarClaimPublico(feat, claim, { completo = false } = {}) {
  const base = {
    key: feat.key,
    conquistada: true,
    portador: claim.character_name_snapshot,
    claimed_at: claim.claimed_at,
  };

  if (completo || feat.reveal_after_claim === "FULL") {
    return {
      ...base,
      nome: feat.nome,
      descricao_publica: feat.descricao_publica,
      legado: feat.powerRecompensa ? { nome: feat.powerRecompensa.nome } : null,
    };
  }
  if (feat.reveal_after_claim === "FLAVOR_ONLY") {
    return { ...base, nome: feat.nome, descricao_publica: feat.descricao_publica, legado: null };
  }
  // REMAIN_SECRET — só existência/portador, nunca a identidade da Proeza.
  return { ...base, nome: null, descricao_publica: null, legado: null };
}

// Proeza ainda não conquistada: HIDDEN nem aparece (retorna null, quem
// chama descarta); TEASER mostra só nome/descricao_publica (§12 — lore
// vaga, nunca a condição secreta, que nem existe neste projeção).
function montarEntradaHall(feat) {
  const claim = feat.claim && feat.claim.status === "VALID" ? feat.claim : null;
  if (claim) return montarClaimPublico(feat, claim);
  if (feat.visibility_before_claim !== "TEASER") return null;
  return { key: feat.key, conquistada: false, nome: feat.nome, descricao_publica: feat.descricao_publica };
}

// GET /api/unique-feats/hall — Hall das Lendas (§13). Conquistadas
// primeiro (mais recente primeiro), teasers depois. Nunca revela a
// contagem total de Proezas secretas (HIDDEN nunca aparece, então o
// total retornado já é só o que É permitido mostrar).
async function obterHall({ page = 1 } = {}) {
  const feats = await UniqueFeat.findAll({
    where: { ativa: true },
    include: [
      { model: UniqueFeatClaim, as: "claim", required: false },
      { model: Power, as: "powerRecompensa" },
    ],
  });

  const entradas = feats.map(montarEntradaHall).filter(Boolean);
  entradas.sort((a, b) => {
    if (a.conquistada !== b.conquistada) return a.conquistada ? -1 : 1;
    if (a.conquistada) return new Date(b.claimed_at) - new Date(a.claimed_at);
    return a.nome.localeCompare(b.nome);
  });

  const totalPaginas = Math.max(1, Math.ceil(entradas.length / PAGE_SIZE));
  const paginaSegura = Math.min(Math.max(1, page), totalPaginas);
  const inicio = (paginaSegura - 1) * PAGE_SIZE;

  return {
    itens: entradas.slice(inicio, inicio + PAGE_SIZE),
    pagina: paginaSegura,
    totalPaginas,
    totalItens: entradas.length,
  };
}

// GET /api/unique-feats/me — Proezas do PRÓPRIO personagem autenticado
// (§14/§17), sempre completas (o portador não tem segredo escondido do
// que ele mesmo conquistou).
async function obterProezasDoPersonagem(idPersonagem) {
  const claims = await UniqueFeatClaim.findAll({
    where: { id_personagem: idPersonagem, status: "VALID" },
    include: [
      {
        model: UniqueFeat,
        as: "proeza",
        include: [{ model: Power, as: "powerRecompensa" }],
      },
    ],
    order: [["claimed_at", "DESC"]],
  });
  return claims.filter((claim) => claim.proeza).map((claim) => montarClaimPublico(claim.proeza, claim, { completo: true }));
}

// GET /api/unique-feats/:key/public (§17).
async function obterFeatPublico(key) {
  const feat = await UniqueFeat.findOne({
    where: { key, ativa: true },
    include: [
      { model: UniqueFeatClaim, as: "claim", required: false },
      { model: Power, as: "powerRecompensa" },
    ],
  });
  if (!feat) return null;
  return montarEntradaHall(feat);
}

// §12.1 — chamado pelos pontos de integração DEPOIS que a transaction
// de origem já commitou (nunca de dentro dela — o claim precisa estar
// garantido antes de qualquer anúncio). Recebe só { key, nome } (o
// bastante pra saber O QUE anunciar) e busca o estado atual — já
// committed — pra montar o payload público de verdade, sempre
// respeitando reveal_after_claim/announce_global como qualquer outro
// consumidor público.
async function anunciarConquistas(proezasConquistadas) {
  for (const { key } of proezasConquistadas ?? []) {
    // eslint-disable-next-line no-await-in-loop -- lote pequeno (normalmente 0 ou 1), sequencial é suficiente
    const feat = await UniqueFeat.findOne({
      where: { key },
      include: [
        { model: UniqueFeatClaim, as: "claim", required: false },
        { model: Power, as: "powerRecompensa" },
      ],
    });
    if (!feat?.announce_global) continue;
    const claim = feat.claim && feat.claim.status === "VALID" ? feat.claim : null;
    if (!claim) continue; // corrida rara: outra transação já reverteu/reparou entre o check() e aqui
    uniqueFeatSocket.emitGlobal("uniqueFeat:claimed", montarClaimPublico(feat, claim));
  }
}

module.exports = {
  obterHall,
  obterProezasDoPersonagem,
  obterFeatPublico,
  anunciarConquistas,
};
