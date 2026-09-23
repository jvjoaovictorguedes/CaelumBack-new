// Bestiário (§4/§5/§7/§27 da spec) — controller só valida e chama isto
// aqui. Usa exatamente as regiões/monstros já cadastrados no Modo
// Aventura (AdventureZone/AdventureZoneMonster/AdventureMonster),
// nunca duplica essa lista (§4).
const AdventureZone = require("../models/AdventureZone");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonster = require("../models/AdventureMonster");
const CharacterMonsterKill = require("../models/CharacterMonsterKill");
const { calcularMaestriaDaRegiao } = require("./masteryService");
const { NIVEL_MAXIMO_MAESTRIA, REQUISITOS_ABATES_POR_NIVEL, numeralRomano } = require("../config/bestiaryConfig");

// GET /api/bestiary — visão geral (§20/§28).
async function listarRegioes(idPersonagem) {
  const zonas = await AdventureZone.findAll({ where: { ativa: true }, order: [["ordem", "ASC"]] });

  const regioes = [];
  for (const zona of zonas) {
    const maestria = await calcularMaestriaDaRegiao(idPersonagem, zona.id);
    regioes.push({
      id: zona.id,
      nome: zona.nome,
      imagem_url: zona.imagem_url,
      descobertos: maestria.descobertos,
      total: maestria.total,
      maestria_nivel: maestria.nivel,
      maestria_numeral: numeralRomano(maestria.nivel),
      progresso_pct_proximo_nivel: maestria.progresso_pct_proximo_nivel,
    });
  }

  const criaturasDescobertas = regioes.reduce((soma, r) => soma + r.descobertos, 0);
  const criaturasTotais = regioes.reduce((soma, r) => soma + r.total, 0);
  const regioesCompletas = regioes.filter((r) => r.total > 0 && r.descobertos === r.total).length;
  const maestriasV = regioes.filter((r) => r.maestria_nivel === NIVEL_MAXIMO_MAESTRIA).length;

  return {
    regioes,
    resumo: {
      criaturas_descobertas: criaturasDescobertas,
      criaturas_totais: criaturasTotais,
      regioes_completas: regioesCompletas,
      regioes_totais: regioes.length,
      maestrias_v: maestriasV,
    },
  };
}

// GET /api/bestiary/regions/:regionId — ficha por monstro, ocultando
// tudo de quem ainda não foi descoberto (§5/§29: nome, imagem,
// raridade, drops, habilidades, atributos — nada vaza antes da
// primeira vitória).
async function obterRegiao(idPersonagem, idZona) {
  const zona = await AdventureZone.findOne({ where: { id: idZona, ativa: true } });
  if (!zona) return null;

  const vinculos = await AdventureZoneMonster.findAll({
    where: { id_area: idZona, ativo: true },
    include: [{ model: AdventureMonster, as: "monstro" }],
  });

  const nomes = vinculos.map((v) => v.monstro.nome);
  const kills = nomes.length
    ? await CharacterMonsterKill.findAll({
        where: { id_personagem: idPersonagem, nome_monstro: nomes },
      })
    : [];
  const killsPorNome = new Map(kills.map((k) => [k.nome_monstro, k]));

  const maestria = await calcularMaestriaDaRegiao(idPersonagem, idZona);
  const proximoNivel = maestria.nivel >= 1 && maestria.nivel < NIVEL_MAXIMO_MAESTRIA ? maestria.nivel + 1 : null;

  const monstros = vinculos.map((v) => {
    const kill = killsPorNome.get(v.monstro.nome);
    const descoberto = Boolean(kill?.primeira_derrota_em);

    if (!descoberto) {
      // §5 — nada de identificador vaza antes da primeira vitória.
      return {
        descoberto: false,
        nome: "???",
        raridade: "???",
        descricao: "???",
        imagem_url: null,
        nivel_min: null,
        nivel_max: null,
        abates: 0,
        requisito_proximo_nivel: null,
      };
    }

    return {
      descoberto: true,
      nome: v.monstro.nome,
      // AdventureMonster não tem campo de "tipo"/habilidades/resistências
      // separado (combate é resolvido por multiplicador em cima dos
      // atributos do jogador, não por ficha de skills por monstro) — a
      // ficha usa o que REALMENTE existe (§7: nunca duplicar/inventar
      // atributo que não é real), daí "raridade" aqui é o tipo de
      // aparição da zona (Comum/Raro).
      raridade: v.tipo_aparicao,
      descricao: v.monstro.descricao,
      imagem_url: v.monstro.imagem_url,
      sprite_key: v.monstro.sprite_key,
      nivel_min: v.nivel_min_override ?? zona.nivel_monstro_min,
      nivel_max: v.nivel_max_override ?? zona.nivel_monstro_max,
      abates: kill.quantidade,
      requisito_proximo_nivel: proximoNivel ? REQUISITOS_ABATES_POR_NIVEL[proximoNivel][v.tipo_aparicao] : null,
    };
  });

  return {
    zona: {
      id: zona.id,
      nome: zona.nome,
      imagem_url: zona.imagem_url,
      descobertos: maestria.descobertos,
      total: maestria.total,
      maestria_nivel: maestria.nivel,
      maestria_numeral: numeralRomano(maestria.nivel),
      progresso_pct_proximo_nivel: maestria.progresso_pct_proximo_nivel,
      proximo_nivel: proximoNivel,
    },
    monstros,
  };
}

module.exports = { listarRegioes, obterRegiao };
