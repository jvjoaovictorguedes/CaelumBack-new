// Recompensa/espólio de vitória em zona do Modo Aventura (§11/§12/§13/
// §15/§16 da spec) — chamado só quando o encontro tem id_area (ver
// combatController.processarTurno). Some ao lado de, e não em cima de,
// o pool genérico de drop (rolarDropDeVitoria/dropService.js): §14 pede
// pra Aventura NÃO virar fonte principal de Material de Expedição, por
// isso zona derrotada rola SÓ no pool próprio de AdventureZoneLoot, com
// item de categoria "Espolio", nunca no pool genérico.
const crypto = require("crypto");
const AdventureZoneLoot = require("../models/AdventureZoneLoot");
const CharacterAdventureSession = require("../models/CharacterAdventureSession");
const Item = require("../models/Item");
const { concederItem } = require("./dropService");
const {
  MULTIPLICADOR_RARO_XP,
  MULTIPLICADOR_RARO_OURO,
  xpBaseDoNivel,
  ouroBaseDoNivel,
} = require("../config/adventureConfig");
const { aplicarBonusDeMaestria } = require("./masteryBonusService");

// Mesmo truque de escala inteira do dropService.sortearComPeso.
const ESCALA = 1000;

function sortearComPeso(itens, pesoDe) {
  const pesoTotal = itens.reduce((soma, item) => soma + pesoDe(item), 0);
  if (pesoTotal <= 0) return null;
  let alvo = crypto.randomInt(0, Math.round(pesoTotal * ESCALA));
  for (const item of itens) {
    alvo -= pesoDe(item) * ESCALA;
    if (alvo < 0) return item;
  }
  return itens[itens.length - 1];
}

// Sorteia UM espólio da zona (§13/§15) — entradas `exclusivo_raro` só
// entram no sorteio quando o encontro derrotado era o Raro da zona
// (§12: Raro pode ter drop exclusivo).
async function sortearEspolioDaZona(idArea, ehRaro, transaction) {
  const where = { id_area: idArea, ativo: true };
  if (!ehRaro) where.exclusivo_raro = false;

  const opcoes = await AdventureZoneLoot.findAll({
    where,
    include: [{ model: Item, as: "item" }],
    transaction,
  });
  const escolhido = sortearComPeso(opcoes, (o) => o.peso);
  if (!escolhido) return null;

  const quantidade =
    escolhido.quantidade_max <= escolhido.quantidade_min
      ? escolhido.quantidade_min
      : crypto.randomInt(escolhido.quantidade_min, escolhido.quantidade_max + 1);

  return { id_item: escolhido.id_item, nome: escolhido.item.nome, quantidade };
}

// Concede XP/ouro/espólio de uma vitória DENTRO de uma zona e atualiza
// os contadores da sessão de caça ativa (§16: persistido por kill, não
// em lote no final). Quem chama ainda precisa dar `character.save()` —
// segue o mesmo padrão do resto do combatController (dinheiro somado em
// memória, salvo junto no final do turno).
async function concederRecompensaDeZona(character, inimigoAtual, transaction) {
  const ehRaro = inimigoAtual.tipo_aparicao === "Raro";

  // Reaproveita a MESMA fórmula base que a Aventura já usava (§8/§11),
  // só multiplicada quando o encontro era o Raro da zona.
  const xpBase = Math.round(
    xpBaseDoNivel(inimigoAtual.nivel) * (ehRaro ? MULTIPLICADOR_RARO_XP : 1),
  );
  const dinheiroBase = Math.round(
    ouroBaseDoNivel(inimigoAtual.nivel) * (ehRaro ? MULTIPLICADOR_RARO_OURO : 1),
  );

  const espolioBase = await sortearEspolioDaZona(inimigoAtual.id_area, ehRaro, transaction);

  // Bônus de Maestria Regional (Bestiário — §14/§16) — usa os abates
  // JÁ existentes antes desta vitória (registrarMorte só roda depois,
  // em combatController.js), então nunca conta o kill atual duas vezes
  // na hora de decidir se o bônus está ativo.
  const { xpGanho, dinheiroGanho, espolio } = await aplicarBonusDeMaestria(
    character.id,
    inimigoAtual.id_area,
    { xpGanho: xpBase, dinheiroGanho: dinheiroBase, espolio: espolioBase },
    transaction,
  );

  if (espolio) {
    await concederItem(character.id, espolio.id_item, espolio.quantidade, transaction);
  }

  // A sessão já foi implicitamente validada no gate de encontro (não dá
  // pra ter um inimigo com id_area sem sessão ativa naquela área), mas
  // busca de novo aqui em vez de confiar num id passado — o Character já
  // está travado (LOCK.UPDATE) nesta mesma transação desde o início do
  // turno, o que serializa qualquer concorrência pro mesmo personagem.
  const sessao = await CharacterAdventureSession.findOne({
    where: { id_personagem: character.id, id_area: inimigoAtual.id_area, ativo: true },
    transaction,
  });
  if (sessao) {
    sessao.monstros_derrotados += 1;
    if (ehRaro) sessao.raros_encontrados += 1;
    sessao.xp_obtida += xpGanho;
    sessao.ouro_obtido += dinheiroGanho;
    if (espolio) sessao.espolios_obtidos += espolio.quantidade;
    await sessao.save({ transaction });
  }

  return { xpGanho, dinheiroGanho, espolio };
}

module.exports = { concederRecompensaDeZona };
