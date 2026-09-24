// Recompensa/espólio de vitória em zona do Modo Aventura (§11/§12/§13/
// §15/§16 da spec original + Expansão Aventura Beta §20/§21/§22). Some
// ao lado de, e não em cima de, o pool genérico de drop
// (rolarDropDeVitoria/dropService.js): §14 pede pra Aventura NÃO virar
// fonte principal de Material de Expedição.
//
// Expansão Aventura Beta §20/§21: loot passou a ser por MONSTRO
// (AdventureMonsterLoot), não mais por zona — o modelo antigo
// (AdventureZoneLoot) deixava um monstro receber o drop de outro da
// mesma área (bug de design corrigido pela expansão). Cada entrada do
// monstro rola INDEPENDENTE (nunca uma escolha exclusiva entre os
// drops), permitindo 0..N espólios por vitória — Comum tem até 2
// entradas, Raro até 3 (ver adventureExpansionData.js).
const crypto = require("crypto");
const AdventureMonsterLoot = require("../models/AdventureMonsterLoot");
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

const ESCALA_PPM = 1_000_000;

// Rola cada entrada de loot do monstro de forma independente — devolve
// um array (pode ser vazio, ou ter mais de um espólio na mesma vitória).
async function sortearEspoliosDoMonstro(idMonstro, transaction) {
  if (!idMonstro) return [];

  const opcoes = await AdventureMonsterLoot.findAll({
    where: { id_monstro: idMonstro, ativo: true },
    include: [{ model: Item, as: "item" }],
    transaction,
  });

  const espolios = [];
  for (const opcao of opcoes) {
    const rolagem = crypto.randomInt(0, ESCALA_PPM);
    if (rolagem >= opcao.chance_ppm) continue;

    const quantidade =
      opcao.quantidade_max <= opcao.quantidade_min
        ? opcao.quantidade_min
        : crypto.randomInt(opcao.quantidade_min, opcao.quantidade_max + 1);

    espolios.push({
      id_item: opcao.id_item,
      nome: opcao.item.nome,
      quantidade,
      imagem_url: opcao.item.imagem_url,
      raridade: opcao.item.raridade,
    });
  }
  return espolios;
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

  const espoliosBase = await sortearEspoliosDoMonstro(inimigoAtual.id_monstro, transaction);

  // Bônus de Maestria Regional (Bestiário — §14/§16) — usa os abates
  // JÁ existentes antes desta vitória (registrarMorte só roda depois,
  // em combatController.js), então nunca conta o kill atual duas vezes
  // na hora de decidir se o bônus está ativo.
  const { xpGanho, dinheiroGanho, espolios } = await aplicarBonusDeMaestria(
    character.id,
    inimigoAtual.id_area,
    { xpGanho: xpBase, dinheiroGanho: dinheiroBase, espolios: espoliosBase },
    transaction,
  );

  for (const espolio of espolios) {
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
    sessao.espolios_obtidos += espolios.reduce((soma, e) => soma + e.quantidade, 0);
    await sessao.save({ transaction });
  }

  return { xpGanho, dinheiroGanho, espolios };
}

module.exports = { concederRecompensaDeZona, sortearEspoliosDoMonstro };
