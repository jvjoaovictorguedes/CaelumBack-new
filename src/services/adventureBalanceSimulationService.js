// Simulador de Balanceamento da Aventura (Admin) — "Simulador de
// Balanceamento V2" mencionado como fase futura em adminAdventureRoutes.js,
// agora construído. Roda N combates PvE completos entre um personagem
// real (snapshot de atributos/equipamento/habilidades, igual
// pvpLiveSocket.carregarLutador) e um ou mais monstros, reaproveitando
// as MESMAS peças do combate de verdade — nenhuma fórmula reimplementada
// aqui:
//   - combatFormulas.js: dano/cura/esquiva/mitigação de defesa (as
//     mesmas funções que combatController.js usa no PvE real);
//   - duelEngine.aplicarAcao: resolve o turno do personagem (ataque
//     básico ou poder) — o mesmo motor que resolve PvP casual/ranqueado;
//   - rankedAiService.escolherAcaoIA: mesma política de decisão já usada
//     pelo defensor assíncrono da Arena Ranqueada (cura com vida baixa,
//     reserva de mana, eficiência de dano por mana).
//
// Três modos (pedido do jogador: "balancear expedição, aventura em
// party e a aventura em si"), cada um reaproveitando o gerador de
// inimigo REAL do modo que está simulando — nunca uma cópia própria:
//   - "zona" (Modo Aventura solo, o que já existia): monstro de stats
//     FIXOS (AdventureMonster), dano rolado no intervalo dano_min..
//     dano_max (crypto.randomInt), exatamente como o turno do inimigo
//     em combatController.processarTurno.
//   - "expedicao": monstro de INTERRUPÇÃO da coleta (Mineração/
//     Silvicultura/Exploração) — gerado ao vivo pela mesma
//     combatController.gerarInimigo(null, undefined, { nivelForcado })
//     que expeditionService.coletar chama, com nivelForcado vindo da
//     MESMA fórmula (deslocamentoDeNivelPorRegiao). Esse gerador nunca
//     produz dano_min/dano_max (só dano_base fixo, já com a variação
//     de ±10% aplicada na geração) — é exatamente o branch de
//     `inimigoAtual.dano_base` que combatController.processarTurno usa
//     quando esses campos não existem.
//   - "grupo": Aventura em Party (src/socket/partySocket.js) — N cópias
//     do mesmo personagem (mesma simplificação que "zona"/"expedicao"
//     já fazem: 1 personagem real representando o "tipo" de build do
//     grupo) contra 1 AdventureMonster com vida/dano escalados pelo
//     TAMANHO do grupo, replicando o cálculo exato de
//     partySocket.js (fatorDificuldadeGrupo). Turnos de aliado E de
//     monstro passam pelos DOIS pelo mesmo duelEngine.aplicarAcao
//     (simetrico, igual o motor de batalha em grupo de verdade — nunca
//     o resolverResultadoDeAcerto manual que zona/expedição usam).
//
// Fora do escopo desta V1 (deliberado, não esquecido): Motor de
// Status (Burn/Stun/Freeze/etc.), cooldown de poder, consumíveis e
// buffs de Taverna/Guilda/Global — suficiente pra calibrar dificuldade
// BASE de monstro (vida/dano/esquiva), que é o pedido original; uma
// simulação com status effects completos é um projeto à parte.
const crypto = require("crypto");
const Character = require("../models/Character");
const Class = require("../models/Class");
const AdventureMonster = require("../models/AdventureMonster");
const ExpeditionRegion = require("../models/ExpeditionRegion");
const { buscarPoderesDoPersonagem } = require("../controllers/pvpController");
const { gerarInimigo } = require("../controllers/combatController");
const { deslocamentoDeNivelPorRegiao } = require("../config/expeditionConfig");
// Módulo inteiro (nunca desestruturado) — Painel Admin de Expedição
// (aplicarOverridesBalanceamento) sobrescreve esses valores em tempo
// real por mutação em-lugar; ler por propriedade a cada simulação é o
// que garante que o simulador reflita o balanceamento ao vivo, nunca
// os defaults congelados no load do processo.
const partyBattleConfig = require("../config/partyBattleConfig");
const { buscarBonusDeAtributos, personagemComBonus } = require("./equipmentBonusService");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
  resolverResultadoDeAcerto,
  aplicarMitigacaoDeDefesa,
} = require("./combatFormulas");
const { aplicarAcao } = require("./duelEngine");
const { escolherAcaoIA } = require("./rankedAiService");
const { calcularPoderMonstro } = require("./combatPowerService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const SIMULACOES_PADRAO = 200;
const SIMULACOES_MAXIMAS = 1000;
// Segurança contra empate infinito (ex.: personagem sem nenhum poder
// ofensivo comprado contra um monstro com defesa alta demais) — um
// combate real de PvE nunca chega nem perto disso.
const MAX_TURNOS_POR_COMBATE = 60;

async function carregarPersonagemParaSimulacao(idPersonagem) {
  const personagem = await Character.findByPk(idPersonagem, { include: [{ model: Class }] });
  if (!personagem) throw erro("Personagem não encontrado.", 404);

  const [poderes, bonus] = await Promise.all([
    buscarPoderesDoPersonagem(idPersonagem),
    buscarBonusDeAtributos(idPersonagem),
  ]);

  const base = comMultiplicadoresDeClasse(personagemComBonus(personagem.toJSON(), bonus), personagem.Class);
  const vidaMax = vidaMaximaDe(base);
  const manaMax = manaMaximaDe(base);
  return { base, poderes, vidaMax, manaMax, nome: personagem.nome, classe: personagem.Class?.nome ?? null };
}

async function carregarMonstro(idMonstro) {
  const monstro = await AdventureMonster.findByPk(idMonstro);
  if (!monstro) throw erro("Monstro não encontrado.", 404);
  if (monstro.vida_maxima == null || monstro.dano_min == null || monstro.dano_max == null) {
    throw erro("Este monstro ainda não tem vida/dano configurados.", 400);
  }
  return monstro;
}

async function carregarRegiaoExpedicao(idRegiao) {
  const regiao = await ExpeditionRegion.findByPk(idRegiao);
  if (!regiao) throw erro("Região de expedição não encontrada.", 404);
  return regiao;
}

function media(lista, campo) {
  if (lista.length === 0) return 0;
  const valores = campo ? lista.map((r) => r[campo]) : lista;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

function arredondar(valor, casas = 0) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

// Núcleo compartilhado por "zona" e "expedicao": personagem sozinho (via
// duelEngine.aplicarAcao) contra UM inimigo cujo turno é resolvido
// manualmente (resolverResultadoDeAcerto + aplicarMitigacaoDeDefesa),
// igual o turno do inimigo em combatController.processarTurno. A ÚNICA
// diferença entre os dois modos é de onde vem `monsterState` e como o
// dano bruto de cada acerto é calculado — por isso injetados como
// parâmetros em vez de duas cópias quase idênticas desta função.
function simularUmCombateSolo(personagem, monsterState, calcularDanoBrutoInimigo) {
  const characterState = { ...personagem.base, vida_atual: personagem.vidaMax, mana_atual: personagem.manaMax };

  let danoCausadoTotal = 0;
  let danoRecebidoTotal = 0;
  let turno = 0;

  while (turno < MAX_TURNOS_POR_COMBATE) {
    turno += 1;

    const { acao } = escolherAcaoIA({
      estado: { vida_atual: characterState.vida_atual, mana_atual: characterState.mana_atual },
      poderes: personagem.poderes,
      vidaMax: personagem.vidaMax,
      manaMax: personagem.manaMax,
    });
    const resultadoPersonagem = aplicarAcao({
      atacante: characterState,
      defensor: monsterState,
      acao,
      vidaMaxAtacante: personagem.vidaMax,
      manaMaxAtacante: personagem.manaMax,
    });
    danoCausadoTotal += resultadoPersonagem.dano;

    if (monsterState.vida_atual <= 0) {
      return {
        resultado: "vitoria",
        turnos: turno,
        danoCausado: danoCausadoTotal,
        danoRecebido: danoRecebidoTotal,
        vidaRestantePercentual: characterState.vida_atual / personagem.vidaMax,
      };
    }

    const acertouMonstro = resolverResultadoDeAcerto({ atacante: monsterState, defensor: characterState });
    if (acertouMonstro.hit) {
      const danoBruto = calcularDanoBrutoInimigo(monsterState);
      const danoFinal = aplicarMitigacaoDeDefesa(danoBruto, characterState);
      characterState.vida_atual = Math.max(0, characterState.vida_atual - danoFinal);
      danoRecebidoTotal += danoFinal;
    }

    if (characterState.vida_atual <= 0) {
      return {
        resultado: "derrota",
        turnos: turno,
        danoCausado: danoCausadoTotal,
        danoRecebido: danoRecebidoTotal,
        vidaRestantePercentual: 0,
      };
    }
  }

  return {
    resultado: "limite_turnos",
    turnos: turno,
    danoCausado: danoCausadoTotal,
    danoRecebido: danoRecebidoTotal,
    vidaRestantePercentual: characterState.vida_atual / personagem.vidaMax,
  };
}

function agregarResultadosSolo(resultados) {
  const n = resultados.length;
  const vitorias = resultados.filter((r) => r.resultado === "vitoria");
  const derrotas = resultados.filter((r) => r.resultado === "derrota");
  const semVencedor = resultados.filter((r) => r.resultado === "limite_turnos");

  return {
    quantidade_simulacoes: n,
    taxa_vitoria_pct: arredondar((vitorias.length / n) * 100, 1),
    vitorias: vitorias.length,
    derrotas: derrotas.length,
    combates_sem_vencedor: semVencedor.length,
    turnos_medios_vitoria: arredondar(media(vitorias, "turnos"), 1),
    turnos_medios_derrota: arredondar(media(derrotas, "turnos"), 1),
    dano_medio_causado_por_combate: arredondar(media(resultados, "danoCausado")),
    dano_medio_recebido_por_combate: arredondar(media(resultados, "danoRecebido")),
    vida_media_restante_ao_vencer_pct: arredondar(media(vitorias, "vidaRestantePercentual") * 100, 1),
  };
}

async function simularZona({ idPersonagem, idMonstro, quantidade }) {
  if (!idPersonagem || !idMonstro) throw erro("Escolha um personagem e um monstro.");
  const n = Math.min(SIMULACOES_MAXIMAS, Math.max(1, Number.parseInt(quantidade, 10) || SIMULACOES_PADRAO));

  const [personagem, monstro] = await Promise.all([
    carregarPersonagemParaSimulacao(idPersonagem),
    carregarMonstro(idMonstro),
  ]);

  const resultados = [];
  for (let i = 0; i < n; i += 1) {
    const monsterState = { vida_atual: monstro.vida_maxima, agilidade: monstro.agilidade ?? 0, defesa: monstro.defesa ?? 0 };
    resultados.push(
      simularUmCombateSolo(personagem, monsterState, () => crypto.randomInt(monstro.dano_min, monstro.dano_max + 1)),
    );
  }

  return {
    modo: "zona",
    personagem: {
      id: idPersonagem,
      nome: personagem.nome,
      classe: personagem.classe,
      vida_maxima: personagem.vidaMax,
      mana_maxima: personagem.manaMax,
      quantidade_poderes: personagem.poderes.length,
    },
    monstro: {
      id: monstro.id,
      nome: monstro.nome,
      nivel: monstro.nivel,
      vida_maxima: monstro.vida_maxima,
      dano_min: monstro.dano_min,
      dano_max: monstro.dano_max,
      defesa: monstro.defesa ?? 0,
      combat_power: calcularPoderMonstro(monstro).combatPower,
    },
    ...agregarResultadosSolo(resultados),
  };
}

async function simularExpedicao({ idPersonagem, idRegiaoExpedicao, quantidade }) {
  if (!idPersonagem || !idRegiaoExpedicao) throw erro("Escolha um personagem e uma região de expedição.");
  const n = Math.min(SIMULACOES_MAXIMAS, Math.max(1, Number.parseInt(quantidade, 10) || SIMULACOES_PADRAO));

  const [personagem, regiao] = await Promise.all([
    carregarPersonagemParaSimulacao(idPersonagem),
    carregarRegiaoExpedicao(idRegiaoExpedicao),
  ]);

  // Mesma fórmula de expeditionService.coletar — nivelForcado nunca
  // usa o nível "cru" da região (1-10, escala de profissão), só o
  // deslocamento em cima do nível de COMBATE real do personagem.
  const nivelForcado = Math.max(1, (personagem.base.nivel ?? 1) + deslocamentoDeNivelPorRegiao(regiao.nivel_minimo));

  const resultados = [];
  const monstrosGerados = [];
  for (let i = 0; i < n; i += 1) {
    // Gerado DE NOVO a cada combate — gerarInimigo tem sua própria
    // variação de ±10% embutida (mesma função que expeditionService
    // chama a cada interrupção real; `jogador` (1º parâmetro) só serve
    // de fallback pro nível quando nivelForcado não é passado, nunca é
    // o caso aqui, então null é seguro e fiel ao caminho real).
    const inimigo = gerarInimigo(null, undefined, { nivelForcado });
    monstrosGerados.push(inimigo);
    resultados.push(simularUmCombateSolo(personagem, { ...inimigo }, (m) => m.dano_base));
  }

  return {
    modo: "expedicao",
    personagem: {
      id: idPersonagem,
      nome: personagem.nome,
      classe: personagem.classe,
      vida_maxima: personagem.vidaMax,
      mana_maxima: personagem.manaMax,
      quantidade_poderes: personagem.poderes.length,
    },
    regiao_expedicao: { id: regiao.id, nome: regiao.nome, profissao: regiao.profissao, nivel_minimo: regiao.nivel_minimo },
    // Nome de campo diferente de "monstro" (zona/grupo) de propósito —
    // não é UM monstro fixo, é a média de N monstros gerados na hora,
    // um por combate (ver gerarInimigo acima).
    monstro_gerado: {
      nivel_forcado: nivelForcado,
      vida_maxima_media: arredondar(media(monstrosGerados, "vida_maxima")),
      dano_base_medio: arredondar(media(monstrosGerados, "dano_base")),
    },
    ...agregarResultadosSolo(resultados),
  };
}

// Réplica de partySocket.js (iniciar aventura em grupo): N aliados
// (round-robin pela ordem, pulando quem já morreu) revezam turnos
// contra 1 monstro de stats fixos escalado pelo TAMANHO do grupo; o
// monstro ataca UM aliado vivo escolhido ao acaso depois que todo mundo
// vivo já agiu na rodada. Aliado E monstro passam pelo MESMO
// duelEngine.aplicarAcao (simetrico) — nunca o resolverResultadoDeAcerto
// manual que zona/expedição usam, porque a batalha em grupo de verdade
// também não usa.
function simularUmaBatalhaDeGrupo(personagem, monstro, tamanhoGrupo) {
  const aventureirosExtras = Math.max(0, tamanhoGrupo - partyBattleConfig.TAMANHO_MINIMO_GRUPO);
  const fatorDificuldadeGrupo = {
    vida: 1 + aventureirosExtras * partyBattleConfig.FATOR_DIFICULDADE_VIDA_POR_EXTRA,
    dano: 1 + aventureirosExtras * partyBattleConfig.FATOR_DIFICULDADE_DANO_POR_EXTRA,
  };
  const vidaMaxima = Math.max(20, Math.round(monstro.vida_maxima * tamanhoGrupo * fatorDificuldadeGrupo.vida));
  const danoMin = Math.max(0, Math.round(monstro.dano_min * fatorDificuldadeGrupo.dano));
  const danoMax = Math.max(danoMin, Math.round(monstro.dano_max * fatorDificuldadeGrupo.dano));

  const inimigo = {
    nivel: monstro.nivel,
    forca: Math.max(1, Math.round((danoMin + danoMax) / 2)),
    vitalidade: Math.max(1, Math.round(vidaMaxima / 5)),
    agilidade: monstro.agilidade,
    velocidade: monstro.velocidade,
    vida_maxima: vidaMaxima,
    vida_atual: vidaMaxima,
    dano_min: danoMin,
    dano_max: danoMax,
    // §12.1 — Defesa NUNCA escala por fatorDificuldadeGrupo, igual
    // partySocket.js já faz no combate real.
    defesa: monstro.defesa ?? 0,
  };

  const membros = [];
  for (let i = 0; i < tamanhoGrupo; i += 1) {
    membros.push({ ...personagem.base, vida_atual: personagem.vidaMax, mana_atual: personagem.manaMax });
  }

  let danoCausadoTotal = 0;
  let danoRecebidoTotal = 0;
  let rodada = 0;

  function estadoFinal(resultado) {
    const vivos = membros.filter((m) => m.vida_atual > 0);
    return {
      resultado,
      rodadas: rodada,
      danoCausado: danoCausadoTotal,
      danoRecebido: danoRecebidoTotal,
      sobreviventes: vivos.length,
      vidaMediaRestantePercentual: vivos.length > 0 ? media(vivos.map((m) => m.vida_atual)) / personagem.vidaMax : 0,
    };
  }

  while (rodada < partyBattleConfig.MAX_RODADAS) {
    rodada += 1;

    for (const membro of membros) {
      if (membro.vida_atual <= 0) continue;

      const { acao } = escolherAcaoIA({
        estado: { vida_atual: membro.vida_atual, mana_atual: membro.mana_atual },
        poderes: personagem.poderes,
        vidaMax: personagem.vidaMax,
        manaMax: personagem.manaMax,
      });
      const resultado = aplicarAcao({
        atacante: membro,
        defensor: inimigo,
        acao,
        vidaMaxAtacante: personagem.vidaMax,
        manaMaxAtacante: personagem.manaMax,
      });
      danoCausadoTotal += resultado.dano;

      if (inimigo.vida_atual <= 0) return estadoFinal("vitoria");
    }

    const vivosAntesDoMonstro = membros.filter((m) => m.vida_atual > 0);
    if (vivosAntesDoMonstro.length === 0) return estadoFinal("derrota");

    const alvo = vivosAntesDoMonstro[Math.floor(Math.random() * vivosAntesDoMonstro.length)];
    const resultadoInimigo = aplicarAcao({
      atacante: inimigo,
      defensor: alvo,
      acao: { tipo: "attack" },
      vidaMaxAtacante: inimigo.vida_maxima,
    });
    danoRecebidoTotal += resultadoInimigo.dano;

    if (membros.every((m) => m.vida_atual <= 0)) return estadoFinal("derrota");
  }

  return estadoFinal("limite_rodadas");
}

async function simularGrupo({ idPersonagem, idMonstro, tamanhoGrupo, quantidade }) {
  if (!idPersonagem || !idMonstro) throw erro("Escolha um personagem e um monstro.");
  const n = Math.min(SIMULACOES_MAXIMAS, Math.max(1, Number.parseInt(quantidade, 10) || SIMULACOES_PADRAO));
  const tamanho = Math.min(
    partyBattleConfig.TAMANHO_MAXIMO_GRUPO,
    Math.max(partyBattleConfig.TAMANHO_MINIMO_GRUPO, Number.parseInt(tamanhoGrupo, 10) || partyBattleConfig.TAMANHO_MINIMO_GRUPO),
  );

  const [personagem, monstro] = await Promise.all([
    carregarPersonagemParaSimulacao(idPersonagem),
    carregarMonstro(idMonstro),
  ]);

  const resultados = [];
  for (let i = 0; i < n; i += 1) {
    resultados.push(simularUmaBatalhaDeGrupo(personagem, monstro, tamanho));
  }

  const vitorias = resultados.filter((r) => r.resultado === "vitoria");
  const derrotas = resultados.filter((r) => r.resultado === "derrota");
  const semVencedor = resultados.filter((r) => r.resultado === "limite_rodadas");

  return {
    modo: "grupo",
    personagem: {
      id: idPersonagem,
      nome: personagem.nome,
      classe: personagem.classe,
      vida_maxima: personagem.vidaMax,
      mana_maxima: personagem.manaMax,
      quantidade_poderes: personagem.poderes.length,
    },
    monstro: {
      id: monstro.id,
      nome: monstro.nome,
      nivel: monstro.nivel,
      vida_maxima: monstro.vida_maxima,
      dano_min: monstro.dano_min,
      dano_max: monstro.dano_max,
      defesa: monstro.defesa ?? 0,
      combat_power: calcularPoderMonstro(monstro).combatPower,
    },
    tamanho_grupo: tamanho,
    quantidade_simulacoes: n,
    taxa_vitoria_pct: arredondar((vitorias.length / n) * 100, 1),
    vitorias: vitorias.length,
    derrotas: derrotas.length,
    combates_sem_vencedor: semVencedor.length,
    rodadas_medias_vitoria: arredondar(media(vitorias, "rodadas"), 1),
    rodadas_medias_derrota: arredondar(media(derrotas, "rodadas"), 1),
    dano_medio_causado_pelo_grupo_por_combate: arredondar(media(resultados, "danoCausado")),
    dano_medio_recebido_pelo_grupo_por_combate: arredondar(media(resultados, "danoRecebido")),
    sobreviventes_medios_ao_vencer: arredondar(media(vitorias, "sobreviventes"), 1),
    vida_media_restante_ao_vencer_pct: arredondar(media(vitorias, "vidaMediaRestantePercentual") * 100, 1),
  };
}

async function simularBalanceamento({ modo = "zona", idPersonagem, idMonstro, idRegiaoExpedicao, tamanhoGrupo, quantidade }) {
  if (modo === "expedicao") return simularExpedicao({ idPersonagem, idRegiaoExpedicao, quantidade });
  if (modo === "grupo") return simularGrupo({ idPersonagem, idMonstro, tamanhoGrupo, quantidade });
  if (modo === "zona") return simularZona({ idPersonagem, idMonstro, quantidade });
  throw erro(`Modo de simulação desconhecido: "${modo}".`);
}

module.exports = { simularBalanceamento };
