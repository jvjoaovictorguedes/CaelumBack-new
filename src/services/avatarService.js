// Avatares de perfil — catálogo estático (raças base, de escolha livre
// pra cosmético) + catálogo restrito (guerreiro/mago/celestial, só pra
// quem É de fato aquela classe/raça) + avatares extras enviados pelo
// admin via Biblioteca de Mídia (categoria "Avatar"), que podem trazer
// sua própria restrição de raça/classe (ver MediaAsset.restrito_raca_id/
// restrito_classe_id — null em qualquer um dos dois = sem restrição
// naquele eixo). "celestial" só sai da rolagem rara de criação
// (Race.raro=true) — nunca aparece na lista normal de raças (ver
// raceController.getAllRaces) — então checar raro+nome aqui é o mesmo
// que checar "essa raça saiu do sorteio raro". Checa pelo nome também
// (não só raro=true) porque produção pode ter outras raças raras (ex.:
// "Primordial") que não devem liberar o avatar Celestial.
const MediaAsset = require("../models/MediaAsset");

const AVATARES_BASE_LIVRES = ["humano", "humana", "elfo", "elfa", "anao", "ana", "orc", "orca"];

const RESTRICOES_ESTATICAS = {
  guerreiro: (character) => character.Class?.nome === "Guerreiro",
  mago: (character) => character.Class?.nome === "Mago",
  celestial: (character) =>
    character.Race?.raro === true && /celestial/i.test(character.Race?.nome_masculino ?? ""),
};

const AVATARES_ESTATICOS_VALIDOS = [...AVATARES_BASE_LIVRES, ...Object.keys(RESTRICOES_ESTATICAS)];

function avatarEstaticoPermitido(chave, character) {
  const regra = RESTRICOES_ESTATICAS[chave];
  return !regra || regra(character);
}

function mediaAssetPermitido(asset, character) {
  if (asset.restrito_raca_id != null && asset.restrito_raca_id !== character.id_raca) return false;
  if (asset.restrito_classe_id != null && asset.restrito_classe_id !== character.id_classe) return false;
  return true;
}

async function avatarKeyPermitidoParaPersonagem(chave, character) {
  if (AVATARES_ESTATICOS_VALIDOS.includes(chave)) {
    return avatarEstaticoPermitido(chave, character);
  }
  const asset = await MediaAsset.findOne({ where: { grupo: chave, categoria: "Avatar", ativo: true } });
  if (!asset) return false;
  return mediaAssetPermitido(asset, character);
}

// Usado pelo picker do jogador pra só oferecer o que ele pode de fato
// escolher — nunca confiar só na validação do PATCH pra isso, senão o
// jogador vê (e clica em) opções que o servidor recusa na hora H.
async function listarAvataresDisponiveis(character) {
  const estaticos = AVATARES_ESTATICOS_VALIDOS.filter((chave) => avatarEstaticoPermitido(chave, character));
  const assetsAdmin = await MediaAsset.findAll({ where: { categoria: "Avatar", ativo: true } });
  const admin = assetsAdmin
    .filter((asset) => mediaAssetPermitido(asset, character))
    .map((asset) => ({ chave: asset.grupo, src: `/api/media/${asset.grupo}` }));
  return { estaticos, admin };
}

module.exports = {
  AVATARES_ESTATICOS_VALIDOS,
  avatarKeyPermitidoParaPersonagem,
  listarAvataresDisponiveis,
};
