// src/controllers/combatController.js
//
// Motor de combate por turnos (PvE).
// O combate usa os atributos do personagem e os poderes aprendidos
// para resolver os turnos.
//
// A lógica de progressão de XP/level/pontos fica no
// experienceService.js.

const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const CharacterInventory = require("../models/CharacterInventory");
const Item = require("../models/Item");
const ConsumableProperties = require("../models/ConsumableProperties");
const { adicionarExperiencia } = require("../services/experienceService");
const {
  calcularDanoBasico,
  aplicarMitigacaoDeDefesa,
  calcularEfeitoPoder,
  custoManaEfetivo,
  chanceDeEsquiva,
  vidaMaximaDe,
  manaMaximaDe,
  danoBasicoEsperado,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { sincronizarRegeneracaoDeVidaEMana } = require("../services/regenService");
const { encontroValido, limparEncontroExpirado } = require("../services/pveEncounterService");
const { rolarDropDeVitoria } = require("../services/dropService");
const { registrarProgresso } = require("../services/missionService");
const { registrarMorte } = require("../services/monsterKillService");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonster = require("../models/AdventureMonster");
const { obterSessaoAtiva } = require("../services/adventureService");
const { sortearMonstroDaZona, sortearNivelMonstro } = require("../services/adventureRollService");
const { concederRecompensaDeZona } = require("../services/adventureRewardService");
const { concederOuro } = require("../services/goldService");
const { registrarProgressoContrato } = require("../services/adventureGuildObjectiveService");
const { registrarProgressoMissaoGuilda } = require("../services/guildMissionService");
const { bonusesAtivosPara } = require("../services/guildBuffService");
const achievementService = require("../services/achievementService");
const statusEffectService = require("../services/statusEffectService");
const cooldownService = require("../services/cooldownService");
const { resolverEfeitosDoUso } = require("../services/combatEffectResolver");
const { definicaoDoStatus } = require("../config/statusEffectConfig");
const { calcularMaestriaDaRegiao } = require("../services/masteryService");
const AdventureZone = require("../models/AdventureZone");
const { BONUS_POR_NIVEL } = require("../config/bestiaryConfig");

// Motor de Status/Cooldown (Especificação Consolidada Poder/Status/
// Cooldown/Balanceamento, §37) — devolve o estado de combate já
// inicializado, tolerando encontros antigos sem essas chaves (ausência =
// vazio, nunca erro).
function estadoDeStatusECooldown(inimigoAtual) {
  return {
    statusEffects: inimigoAtual.statusEffects ?? { player: [], enemy: [] },
    cooldowns: inimigoAtual.cooldowns ?? { player: {}, enemy: {} },
    combatTurn: (inimigoAtual.combatTurn ?? 0) + 1,
  };
}

const NOMES_INIMIGOS = [
  "Lobo das Sombras",
  "Bandido Errante",
  "Golem de Pedra",
  "Espectro Sussurrante",
  "Orc Guerreiro",
  "Aranha Venenosa",
  "Cultista Renegado",
  "Draconídeo Jovem",
  "Minotauro",
];

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Estado do inimigo ativo, persistido em Character.encontro_pve (coluna
// JSONB) — não mais só em memória do processo. Antes um Map em memória
// (characterId -> inimigo) sobrevivia enquanto o processo Node ficasse de
// pé, mas qualquer restart (deploy, crash, autoscale) apagava todo
// combate em andamento sem aviso: o jogador via o inimigo na tela, clicava
// em atacar, e caía em "Nenhum combate ativo" do nada — o inimigo tinha
// sumido da memória mas a tela ainda mostrava ele. Persistir no personagem
// também resolve de graça a limitação de só funcionar com UMA instância
// do processo (documentada em rateLimitMiddleware.js pro rate limiter,
// que tem o mesmo problema).
//
// O inimigo nunca vem do cliente — só o servidor sabe o estado real.
// Qualquer `enemy` que o corpo da requisição ainda contenha é ignorado.
// (VALIDADE_ENCONTRO_MS/encontroValido/limparEncontroExpirado agora vêm
// de pveEncounterService.js — ver comentário lá sobre o motivo de terem
// saído daqui.)

// Quantos turnos de ataque básico, em média, cada lado precisa pra matar
// o outro. O do inimigo é maior de propósito: o jogador sai na frente
// (folga pra usar poder/errar um turno/tomar uma esquiva ruim), mas
// ainda precisa jogar direito — não é vitória de graça.
const RODADAS_PARA_MATAR_INIMIGO = 4;
const RODADAS_PARA_INIMIGO_MATAR_JOGADOR = 4.2;

// Quanto vida_maxima/dano_base do inimigo escalam pra CIMA por nível
// sorteado acima do nível ATUAL do jogador (§5 — zonas nunca bloqueiam
// entrada, mas precisam ser de verdade mais perigosas). Sem isso, um
// personagem nível 12 caçando no Covil do Minotauro (30-50) podia
// sortear um Minotauro "nível 50" que, na prática, tinha vida_maxima/
// dano_base calibrados pros PRÓPRIOS atributos daquele personagem
// nível 12 (ver gerarInimigo) — o "nível 50" ficava só no nome, o
// rótulo de perigo (calcularPerigo, ver adventureConfig.js) prometia
// "EXTREMO" e a luta não entregava nada disso.
const FATOR_ESCALA_POR_NIVEL_ACIMA_DO_JOGADOR = 0.07;
// Teto pra essa escala não sair de controle numa zona futura com uma
// faixa de nível muito mais larga que as atuais.
const ESCALA_MAXIMA_POR_DIFERENCA_DE_NIVEL = 6;

// Fila (pedido do jogador): o nível do monstro tinha PESO ZERO pra
// baixo — um personagem nível 107 caçando um "Javali Selvagem (Nv. 1)"
// recebia um inimigo calibrado 100% em cima dos atributos REAIS do
// próprio jogador (ver gerarInimigo), então esse Javali sobrevivia a um
// hit e ainda batia de volta por dano relevante, exatamente como
// qualquer outro monstro "nível 1" contra qualquer outro nível de
// jogador — o número do nível virava só rótulo.
//
// Primeira tentativa de correção usava DIFERENÇA ABSOLUTA de nível
// (como o fator ACIMA usa) — e não funcionava: um gap de "10 níveis" é
// desprezível pra um jogador nível 107 (quase no mesmo patamar), mas
// ESMAGADOR pra um nível 14 (o monstro tem menos de 1/3 do nível dele).
// Bug real reportado por causa disso: nível 4 vs nível 14 só caía pra
// ~85% de força (diferença absoluta pequena), continuando forte o
// bastante pra matar o jogador. Diferença absoluta não captura "quão
// pra trás, proporcionalmente" — RAZÃO entre os níveis captura.
//
// razão² (não razão linear): precisa cair rápido o bastante pra um gap
// de metade do nível (razão 0.5) já ficar claramente fraco (~25%), sem
// zerar de propósito uma diferença pequena (razão 0.9+ fica perto de
// 0.8+, ainda dá luta).
const PISO_ESCALA_POR_NIVEL_ABAIXO_DO_JOGADOR = 0.05;

// Fator de escala assinado (positivo = monstro no nível do jogador ou
// acima, negativo = abaixo) — mesma curva usada tanto no solo
// (gerarInimigo) quanto no grupo (gerarInimigoDeGrupo), pra nunca
// divergir entre os dois modos.
function calcularEscalaPorNivel(nivelMonstro, nivelReferencia) {
  const nivelRef = Math.max(1, nivelReferencia ?? 1);
  const diferenca = nivelMonstro - nivelRef;
  if (diferenca >= 0) {
    return Math.min(
      ESCALA_MAXIMA_POR_DIFERENCA_DE_NIVEL,
      1 + diferenca * FATOR_ESCALA_POR_NIVEL_ACIMA_DO_JOGADOR,
    );
  }
  const razao = nivelMonstro / nivelRef;
  return Math.max(PISO_ESCALA_POR_NIVEL_ABAIXO_DO_JOGADOR, razao * razao);
}

// Gera um inimigo calibrado a partir dos ATRIBUTOS DE VERDADE do
// personagem (já com bônus de equipamento somado) — não mais só o nível.
// Antes o inimigo era pensado pra um "personagem médio" daquele nível
// (uma quantidade assumida de força/vitalidade); quem não investia
// pontos em vida, por exemplo, sempre enfrentava um inimigo tanque
// demais pro tanto de dano que conseguia causar, e vice-versa. Agora a
// vida do inimigo escala com o ataque real do jogador (se você bate
// forte, o inimigo aguenta mais golpes, mas você ainda mata em ~4
// turnos) e o dano do inimigo escala com a vida real do jogador (se
// você é frágil, o inimigo bate mais fraco, mas ainda ameaça em ~6
// turnos) — o resultado da luta depende do seu build de verdade, não
// de uma média que talvez nem seja a sua.
// `nomeAlvo` é só o nome do monstro já sorteado (por
// sortearMonstroDaZona, no controller) — nunca uma escolha do jogador
// (removida a pedido dele: a Aventura agora é sempre 100% aleatória).
//
// `opcoes.nivelForcado` e `opcoes.multiplicadores` vêm do Modo Aventura
// (§8/§9/§10 da spec, ver gerarInimigoParaPersonagem): o nível do
// monstro sorteado pela zona substitui o nível do PRÓPRIO jogador (uma
// zona de nível baixo precisa gerar monstro de nível baixo mesmo pra um
// personagem de nível alto caçando lá), e os multiplicadores do
// AdventureMonster dão identidade de combate própria a cada criatura em
// cima da MESMA calibração — nunca uma escala nova.
function gerarInimigo(jogador, nomeAlvo, opcoes = {}) {
  const { nivelForcado, multiplicadores } = opcoes;
  const mult = {
    vida: multiplicadores?.vida ?? 1,
    dano: multiplicadores?.dano ?? 1,
    agilidade: multiplicadores?.agilidade ?? 1,
    velocidade: multiplicadores?.velocidade ?? 1,
  };
  const nivel = Math.max(1, nivelForcado ?? jogador.nivel ?? 1);
  const variacao = () => 0.9 + Math.random() * 0.2; // ±10%

  const vidaJogador = vidaMaximaDe(jogador);
  const ataqueJogador = Math.max(1, danoBasicoEsperado(jogador));

  const escalaPorNivel = calcularEscalaPorNivel(nivel, jogador.nivel);

  const vidaMaxima = Math.max(
    20,
    Math.round(ataqueJogador * RODADAS_PARA_MATAR_INIMIGO * variacao() * mult.vida * escalaPorNivel),
  );
  const danoBase = Math.max(
    1,
    Math.round(
      (vidaJogador / RODADAS_PARA_INIMIGO_MATAR_JOGADOR) * variacao() * mult.dano * escalaPorNivel,
    ),
  );

  // Agilidade/velocidade espelham as do próprio jogador (com variação),
  // pra esquiva e ordem de turno ficarem parelhas com o que ele tem —
  // em vez de, de novo, assumir uma agilidade "média" pro nível.
  const agilidade = Math.max(1, Math.round((jogador.agilidade || 1) * variacao() * mult.agilidade));
  const velocidade = Math.max(1, Math.round((jogador.velocidade || 1) * variacao() * mult.velocidade));

  // forca/vitalidade do inimigo aqui são só pra manter o formato da
  // resposta (a API sempre devolveu esses campos) — quem decide o
  // resultado da luta é vida_maxima/dano_base calculados acima.
  const forca = Math.max(1, Math.round((danoBase - 3) / 0.7));
  const vitalidade = Math.max(1, Math.round((vidaMaxima - 20) / 5));

  return {
    nome: nomeAlvo ?? sortear(NOMES_INIMIGOS),
    nivel,
    forca,
    vitalidade,
    agilidade,
    velocidade,
    vida_maxima: vidaMaxima,
    vida_atual: vidaMaxima,
    dano_base: danoBase,
  };
}

// Mesma calibração de gerarInimigo acima, só que pro modo em grupo
// (Aventura em party — ver src/socket/partySocket.js): em vez da vida/
// ataque de UM jogador, usa a SOMA de vida_maxima e de dano esperado do
// grupo inteiro pra vida do monstro (N aliados batem nele por rodada,
// então precisa aguentar os N golpes, não só o de um), mas o dano do
// monstro continua calibrado pela vida MÉDIA de um único aliado (o
// monstro só ataca UM aliado por vez, então escalar pela vida somada do
// grupo inteiro deixaria esse golpe absurdamente forte contra quem for
// atingido). Nível/agilidade/velocidade usam a média do grupo.
function gerarInimigoDeGrupo(
  { vidaTotalGrupo, ataqueTotalGrupo, vidaMediaAliado, nivelMedio, agilidadeMedia, velocidadeMedia },
  nomeAlvo,
  opcoes = {},
) {
  const { nivelForcado, multiplicadores } = opcoes;
  const mult = {
    vida: multiplicadores?.vida ?? 1,
    dano: multiplicadores?.dano ?? 1,
    agilidade: multiplicadores?.agilidade ?? 1,
    velocidade: multiplicadores?.velocidade ?? 1,
  };
  const nivel = Math.max(1, nivelForcado ?? nivelMedio ?? 1);
  const variacao = () => 0.9 + Math.random() * 0.2;

  const escalaPorNivel = calcularEscalaPorNivel(nivel, nivelMedio);

  const vidaMaxima = Math.max(
    20,
    Math.round(ataqueTotalGrupo * RODADAS_PARA_MATAR_INIMIGO * variacao() * mult.vida * escalaPorNivel),
  );
  const danoBase = Math.max(
    1,
    Math.round(
      (vidaMediaAliado / RODADAS_PARA_INIMIGO_MATAR_JOGADOR) * variacao() * mult.dano * escalaPorNivel,
    ),
  );

  const agilidade = Math.max(1, Math.round((agilidadeMedia || 1) * variacao() * mult.agilidade));
  const velocidade = Math.max(1, Math.round((velocidadeMedia || 1) * variacao() * mult.velocidade));
  const forca = Math.max(1, Math.round((danoBase - 3) / 0.7));
  const vitalidade = Math.max(1, Math.round((vidaMaxima - 20) / 5));

  return {
    nome: nomeAlvo ?? sortear(NOMES_INIMIGOS),
    nivel,
    forca,
    vitalidade,
    agilidade,
    velocidade,
    vida_maxima: vidaMaxima,
    vida_atual: vidaMaxima,
    dano_base: danoBase,
  };
}

exports.gerarInimigo = gerarInimigo;
exports.gerarInimigoDeGrupo = gerarInimigoDeGrupo;
exports.calcularEscalaPorNivel = calcularEscalaPorNivel;

// GET /api/combat/enemy/:characterId
// Gera um inimigo compatível com o nível do personagem.
//
// Roda inteira dentro de uma transação com o personagem travado
// (LOCK.UPDATE), do mesmo jeito que executarTurno — sem isso, duas
// chamadas concorrentes a esta rota (duplo clique, duas abas, ou o
// React re-executando o carregamento da tela de Aventura) liam
// encontro_pve como "vazio" ao mesmo tempo, cada uma gerava e SALVAVA
// um inimigo diferente, e a última a salvar vencia — a tela do jogador
// podia ficar mostrando um inimigo (da resposta que chegou primeiro)
// que já não é mais o que está de fato em encontro_pve no banco. Daí
// em diante, qualquer ataque batia em "Nenhum combate ativo" mesmo com
// a tela mostrando um inimigo na cara do jogador. Não inclui Class no
// SELECT travado (FOR UPDATE não pode se aplicar ao lado nullable de um
// LEFT JOIN) — busca a classe à parte, sem lock, como o resto da base
// já faz nesse mesmo contorno.
exports.gerarInimigoParaPersonagem = async (req, res) => {
  try {
    return await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.personagemAtual.id, {
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });

      if (!character) {
        return res.status(404).json({
          message: "Personagem não encontrado.",
        });
      }

      // Se já existe um encontro em andamento (não expirado), devolve ELE
      // — nunca sorteia um novo. Sem essa checagem, chamar GET
      // /combat/enemy de novo no meio de uma luta ruim descartava o
      // inimigo atual (com o dano já sofrido) e sorteava outro do zero,
      // com vida cheia — um reroll de graça pra fugir de um inimigo difícil.
      const encontroEmAndamento = encontroValido(character);
      if (encontroEmAndamento) {
        const { criadoEm, statsPersonagem, ...inimigoAtual } = encontroEmAndamento;
        return res.status(200).json({
          status: "success",
          data: { enemy: inimigoAtual },
        });
      }

      // §1/§17/§29/§31 da spec do Modo Aventura: combate PvE não pode
      // mais começar fora de uma Área de Caça — validado aqui no
      // servidor (dentro da MESMA transação que trava o Character),
      // nunca só no frontend. Sem sessão ativa, nem chega a sortear
      // monstro nenhum.
      const sessaoAtiva = await obterSessaoAtiva(character.id, { transaction });
      if (!sessaoAtiva) {
        return res.status(409).json({
          message: "Entre em uma Área de Caça antes de procurar uma criatura.",
        });
      }

      const zona = sessaoAtiva.area;
      const monstrosDaZona = await AdventureZoneMonster.findAll({
        where: { id_area: zona.id, ativo: true },
        include: [{ model: AdventureMonster, as: "monstro" }],
        transaction,
      });
      if (monstrosDaZona.length === 0) {
        return res.status(500).json({
          message: "Área de Caça sem monstros configurados.",
        });
      }

      const classe = await Class.findByPk(character.id_classe, { transaction });
      const bonusEquipamento = await buscarBonusDeAtributos(character.id, transaction);
      const jogadorEfetivo = comMultiplicadoresDeClasse(
        personagemComBonus(character.toJSON(), bonusEquipamento),
        classe,
      );

      // Aplica a regeneração passiva acumulada antes de calibrar/entrar
      // em combate — sem isso, um jogador que ficou horas offline entrava
      // na luta com a vida/mana velha (baixa), mesmo já tendo regenerado.
      // Muta `character`/`jogadorEfetivo` em memória; persistido junto
      // com encontro_pve no save abaixo, que já é obrigatório de
      // qualquer jeito.
      sincronizarRegeneracaoDeVidaEMana(character, jogadorEfetivo);

      // Escolha de alvo removida (pedido do jogador) — sempre sorteio
      // ponderado normal da zona (§6/§7), nunca mais "caçar" um monstro
      // específico.
      const escolhido = sortearMonstroDaZona(monstrosDaZona);

      const nivelSorteado = sortearNivelMonstro(escolhido, zona);
      const multiplicadores = {
        vida: escolhido.monstro.multiplicador_vida,
        dano: escolhido.monstro.multiplicador_dano,
        agilidade: escolhido.monstro.multiplicador_agilidade,
        velocidade: escolhido.monstro.multiplicador_velocidade,
      };
      const inimigo = gerarInimigo(jogadorEfetivo, escolhido.monstro.nome, {
        nivelForcado: nivelSorteado,
        multiplicadores,
      });

      // Snapshot dos atributos ESTRUTURAIS do personagem no exato momento
      // em que o encontro começa (força/vitalidade/etc já com bônus de
      // equipamento, arma equipada, defesa, multiplicadores de classe) —
      // sem isso, /combat/action recalculava esses valores A CADA TURNO a
      // partir do equipamento ATUAL, e o inimigo continuava calibrado pro
      // equipamento de quando foi gerado: trocar pra um equipamento mais
      // fraco só pra gerar um inimigo fácil e depois voltar ao
      // equipamento forte pra lutar (ou o inverso) virava trivial. Só HP/
      // mana atuais continuam vivos/atualizáveis turno a turno — o resto
      // fica congelado até o encontro terminar (vitória ou derrota).
      const statsPersonagem = {
        nivel: character.nivel,
        forca: jogadorEfetivo.forca,
        vitalidade: jogadorEfetivo.vitalidade,
        agilidade: jogadorEfetivo.agilidade,
        inteligencia: jogadorEfetivo.inteligencia,
        velocidade: jogadorEfetivo.velocidade,
        defesa: jogadorEfetivo.defesa,
        arma_equipada: jogadorEfetivo.arma_equipada,
        multiplicador_vida_por_nivel: jogadorEfetivo.multiplicador_vida_por_nivel,
        multiplicador_mana_por_nivel: jogadorEfetivo.multiplicador_mana_por_nivel,
        multiplicador_dano_fisico: jogadorEfetivo.multiplicador_dano_fisico,
        multiplicador_dano_magico: jogadorEfetivo.multiplicador_dano_magico,
      };

      // Metadados da zona/monstro ficam junto no mesmo JSONB (§28-§30) —
      // é o que executarTurno usa depois pra decidir recompensa/espólio
      // de zona e atualizar os contadores da sessão (ver
      // adventureRewardService.js).
      character.encontro_pve = {
        ...inimigo,
        criadoEm: Date.now(),
        statsPersonagem,
        id_area: zona.id,
        id_monstro: escolhido.id_monstro,
        tipo_aparicao: escolhido.tipo_aparicao,
        // Expansão Aventura Beta §29 — frontend resolve sprite por essa
        // chave, nunca mais por nome (null até a arte ser enviada, cai
        // no EnemySprite genérico).
        sprite_key: escolhido.monstro?.sprite_key ?? null,
        // Motor de Status/Cooldown (§37) — estado vazio no início do
        // encontro; executarTurno preenche conforme o combate avança.
        statusEffects: { player: [], enemy: [] },
        cooldowns: { player: {}, enemy: {} },
        combatTurn: 0,
      };
      await character.save({ transaction });

      res.status(200).json({
        status: "success",
        data: {
          enemy: inimigo,
        },
      });
    });
  } catch (error) {
    console.error("Erro ao gerar inimigo:", error);

    res.status(500).json({
      message: "Erro interno do servidor ao gerar inimigo.",
    });
  }
};


exports.executarTurno = async (req, res) => {
  try {
    const characterId = req.personagemAtual.id;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        message:
          "Dados insuficientes para resolver o turno de combate.",
      });
    }

    // Uma única transação com o personagem travado (LOCK.UPDATE) cobre
    // o turno inteiro, do início ao fim: serializa qualquer segunda
    // requisição concorrente pra esse mesmo personagem (duplo clique,
    // duas abas) — ela só é atendida depois que esta transação
    // commitar, e nesse ponto já enxerga o encontro_pve atualizado (ou
    // ausente, se o combate já tiver terminado nesta primeira).
    return await sequelize.transaction(async (transaction) => {
      // Não precisa mais incluir Class aqui: os multiplicadores de
      // classe já vêm congelados em inimigoAtual.statsPersonagem (ver
      // processarTurno) — evita o join e a pegadinha de "FOR UPDATE"
      // não poder se aplicar ao lado nullable de um LEFT OUTER JOIN.
      const character = await Character.findByPk(characterId, {
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });

      if (!character) {
        return res.status(404).json({ message: "Personagem não encontrado." });
      }

      // O inimigo nunca vem do cliente — só o servidor sabe o estado
      // real (Character.encontro_pve). Qualquer `enemy` que o corpo da
      // requisição ainda contenha é ignorado de propósito.
      const inimigoAtual = encontroValido(character);
      if (!inimigoAtual) {
        return res.status(400).json({
          message:
            "Nenhum combate ativo para esse personagem. Busque um inimigo antes de atacar.",
        });
      }

      return await processarTurno({ req, res, character, inimigoAtual, transaction });
    });
  } catch (error) {
    console.error(
      "Erro ao processar turno de combate:",
      error
    );

    res.status(500).json({
      message:
        "Erro interno do servidor ao processar combate.",
    });
  }
};

async function processarTurno({ req, res, character, inimigoAtual, transaction }) {
  const { action } = req.body;
  const characterId = character.id;

    const log = [];

    // Atributos estruturais (força/vitalidade/arma equipada/defesa/
    // multiplicadores de classe) vêm do SNAPSHOT tirado quando o
    // encontro começou (ver gerarInimigoParaPersonagem) — NUNCA
    // recalculados do equipamento atual aqui. Só vida/mana atuais
    // continuam vindo do personagem de verdade, porque esses sim
    // precisam refletir o progresso real do combate turno a turno.
    // Encontros criados antes dessa mudança (sem statsPersonagem
    // salvo) caem no fallback de character.toJSON() puro — janela
    // curta e não reexplorável (só afeta uma luta já em andamento no
    // exato momento do deploy).
    const personagemAtual = {
      ...character.toJSON(),
      ...inimigoAtual.statsPersonagem,
      vida_atual: character.vida_atual,
      mana_atual: character.mana_atual,
    };

    // Mesma regeneração passiva do início do combate — evita bloquear
    // "derrotado" quem já regenerou o suficiente enquanto estava longe.
    // Só ajusta o objeto em memória aqui; a persistência acontece no(s)
    // save() mais abaixo, já dentro da mesma transação/lock.
    sincronizarRegeneracaoDeVidaEMana(character, personagemAtual);

    if (personagemAtual.vida_atual <= 0) {
      return res.status(400).json({
        message:
          "Este personagem está derrotado e precisa se recuperar.",
      });
    }

    // ==========================================================
    // MOTOR DE STATUS/COOLDOWN — INÍCIO DO TURNO DO JOGADOR
    // (Especificação Consolidada Poder/Status/Cooldown/Balanceamento,
    // §23 passos 1/2) — ticks de Burn/Bleed/Poison que estejam no
    // próprio jogador podem matá-lo ANTES de agir; nesse caso a ação
    // nem chega a acontecer.
    // ==========================================================
    const { statusEffects, cooldowns, combatTurn } = estadoDeStatusECooldown(inimigoAtual);
    const cooldownsPlayerAplicadosNesteTurno = new Set();
    const cooldownsEnemyAplicadosNesteTurno = new Set();

    personagemAtual.vida_atual = statusEffectService.processarTicksDeInicio({
      vidaAtual: personagemAtual.vida_atual,
      defensor: personagemAtual,
      lista: statusEffects.player,
      log,
      nomeAlvo: "Você",
    });

    if (personagemAtual.vida_atual <= 0) {
      character.vida_atual = 0;
      character.mana_atual = personagemAtual.mana_atual;
      character.ultima_atualizacao_vida = new Date();
      character.ultima_atualizacao_mana = new Date();
      character.encontro_pve = null;
      log.push("Você foi derrotado e precisa se recuperar antes de lutar de novo.");
      await character.save({ transaction });
      return res.status(200).json({
        status: "success",
        data: {
          done: true,
          victory: false,
          log,
          character: {
            vida_atual: 0,
            mana_atual: personagemAtual.mana_atual,
            nivel: character.nivel,
            experiencia: character.experiencia,
            pontos_distribuir: character.pontos_distribuir,
          },
          enemy: inimigoAtual,
          statusEffects,
        },
      });
    }

    // ==========================================================
    // TURNO DO JOGADOR
    // ==========================================================

    let poderUsado = null;
    let nivelHabilidadeUsada = 1;

    if (action.type === "power") {
      // Silêncio bloqueia habilidades ativas, não o ataque básico nem
      // itens (§26) — checado antes de qualquer outra coisa, pra uma
      // tentativa bloqueada nunca iniciar cooldown (§35).
      if (statusEffectService.bloqueiaHabilidadesAtivas(statusEffects.player)) {
        return res.status(403).json({
          message: "Você está silenciado e não pode usar habilidades.",
        });
      }

      poderUsado = await Power.findByPk(action.powerId);

      if (!poderUsado) {
        return res.status(404).json({
          message: "Poder não encontrado.",
        });
      }

      const aprendeu = await CharacterAbilities.findOne({
        where: {
          id_personagem: characterId,
          id_power: poderUsado.id,
        },
      });

      if (!aprendeu) {
        return res.status(403).json({
          message:
            "Este personagem não aprendeu este poder.",
        });
      }

      // Poder passivo não é "usável" manualmente, e um poder desativado
      // (is_active: false) não pode ser disparado por um request forjado
      // direto na API — só a lista de poderes ativos escolhidos pelo
      // jogador conta.
      if (!aprendeu.is_active) {
        return res.status(403).json({
          message: "Este poder não está ativo para este personagem.",
        });
      }

      if (poderUsado.tipo_poder !== "Ativo") {
        return res.status(403).json({
          message: "Este poder não pode ser usado manualmente em combate.",
        });
      }

      if (!cooldownService.podeUsar(cooldowns.player, poderUsado.id)) {
        return res.status(400).json({
          message: `Esta habilidade ainda está em cooldown (${cooldownService.turnosRestantes(cooldowns.player, poderUsado.id)} turno(s)).`,
        });
      }

      nivelHabilidadeUsada = aprendeu.nivel_habilidade;

      if (
        personagemAtual.mana_atual <
        custoManaEfetivo(poderUsado, nivelHabilidadeUsada)
      ) {
        return res.status(400).json({
          message: "Mana insuficiente.",
        });
      }
    }

    // Consumível como ação de combate — a peça que faltava pro bloqueio
    // em characterInventoryController.js fazer sentido de verdade (antes
    // dele, "usar poção só como ação de combate" bloqueava a poção fora
    // do combate mas não abria nenhum jeito de usá-la DENTRO dele: o
    // jogador ficava sem cura nenhuma durante uma luta). Gasta o turno
    // igual um ataque ou poder — o inimigo ainda ataca depois.
    let inventoryEntry = null;
    let itemConsumivel = null;
    let efeitoConsumivel = null;

    if (action.type === "item") {
      inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: action.itemId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!inventoryEntry || inventoryEntry.quantidade < 1) {
        return res.status(400).json({
          message: "Você não possui esse item no inventário.",
        });
      }

      itemConsumivel = await Item.findByPk(action.itemId, { transaction });
      if (!itemConsumivel || itemConsumivel.tipo_item !== "Consumivel") {
        return res.status(400).json({
          message: "Este item não pode ser usado em combate.",
        });
      }

      efeitoConsumivel = await ConsumableProperties.findByPk(action.itemId, { transaction });
      if (!efeitoConsumivel) {
        return res.status(400).json({
          message: "Este item não possui efeito configurado.",
        });
      }
    }

    // ==========================================================
    // PODER
    // ==========================================================

    if (poderUsado) {
      personagemAtual.mana_atual -=
        custoManaEfetivo(poderUsado, nivelHabilidadeUsada);

      // Cooldown só entra AGORA — a habilidade já passou por todas as
      // validações e foi consumida como ação válida (§35). Marcado como
      // "aplicado neste turno" pra decrementarCooldowns (fim do turno do
      // jogador, mais abaixo) não descontar um turno dela hoje mesmo
      // (ver cooldownService.js).
      cooldowns.player = cooldownService.iniciarCooldown(cooldowns.player, poderUsado.id, poderUsado.cooldown);
      cooldownsPlayerAplicadosNesteTurno.add(cooldownService.chaveDoPoder(poderUsado.id));

      const { dano: danoBase, cura } =
        calcularEfeitoPoder(
          poderUsado,
          personagemAtual,
          nivelHabilidadeUsada
        );
      // Enfraquecimento (§45) reduz o dano de SAÍDA de quem está com o
      // status, antes de qualquer mitigação do alvo.
      const dano = Math.round(danoBase * statusEffectService.multiplicadorDeDanoDeSaida(statusEffects.player));

      if (dano > 0) {
        if (
          chanceDeEsquiva(
            inimigoAtual,
            personagemAtual
          )
        ) {
          log.push(
            `${inimigoAtual.nome} esquivou de ${poderUsado.nome}!`
          );
        } else {
          const danoMitigado = aplicarMitigacaoDeDefesa(dano, inimigoAtual);
          inimigoAtual.vida_atual = Math.max(
            0,
            inimigoAtual.vida_atual - danoMitigado
          );

          log.push(
            `Você usou ${poderUsado.nome} e causou ${danoMitigado} de dano em ${inimigoAtual.nome}.`
          );

          // Efeitos de status configurados da Power (§19/§29-31) — só
          // rola/aplica quando o golpe de fato acerta.
          const novosEfeitos = await resolverEfeitosDoUso({
            power: poderUsado,
            personagemCaster: personagemAtual,
            casterActorId: "player",
            turno: combatTurn,
          });
          for (const efeito of novosEfeitos) {
            statusEffects.enemy = statusEffectService.aplicarStatus(statusEffects.enemy, efeito);
            const def = definicaoDoStatus(efeito.key);
            log.push(`${inimigoAtual.nome} recebeu ${def.nomeUi} por ${efeito.remainingTurns} turno(s).`);
          }
        }
      }

      if (cura > 0) {
        personagemAtual.vida_atual = Math.min(
          vidaMaximaDe(personagemAtual),
          personagemAtual.vida_atual + cura
        );

        log.push(
          `Você usou ${poderUsado.nome} e recuperou ${cura} de vida.`
        );
      }
    }

    // ==========================================================
    // ITEM (consome o turno — não causa dano nenhum no inimigo)
    // ==========================================================

    else if (efeitoConsumivel) {
      // Mesma fórmula (percentual da vida/mana MÁXIMA, não pontos
      // fixos) do uso fora de combate em characterInventoryController.js
      // — usa vidaMaximaDe/manaMaximaDe sobre personagemAtual, que já
      // reflete o snapshot congelado do encontro (bônus de equipamento,
      // multiplicador de classe), pro valor curado bater com o mesmo
      // teto de vida/mana que o resto do combate está usando.
      if (efeitoConsumivel.efeito_vida) {
        const cura = Math.round(vidaMaximaDe(personagemAtual) * (efeitoConsumivel.efeito_vida / 100));
        personagemAtual.vida_atual = Math.min(
          vidaMaximaDe(personagemAtual),
          personagemAtual.vida_atual + cura,
        );
        log.push(`Você usou ${itemConsumivel.nome} e recuperou ${cura} de vida.`);
      }

      if (efeitoConsumivel.efeito_mana) {
        const curaMana = Math.round(manaMaximaDe(personagemAtual) * (efeitoConsumivel.efeito_mana / 100));
        personagemAtual.mana_atual = Math.min(
          manaMaximaDe(personagemAtual),
          personagemAtual.mana_atual + curaMana,
        );
        log.push(`Você usou ${itemConsumivel.nome} e recuperou ${curaMana} de mana.`);
      }

      inventoryEntry.quantidade -= 1;
      if (inventoryEntry.quantidade <= 0) {
        await inventoryEntry.destroy({ transaction });
      } else {
        await inventoryEntry.save({ transaction });
      }
    }

    // ==========================================================
    // ATAQUE BÁSICO
    // ==========================================================

    else {
      if (
        chanceDeEsquiva(
          inimigoAtual,
          personagemAtual
        )
      ) {
        log.push(
          `${inimigoAtual.nome} esquivou do seu ataque!`
        );
      } else {
        const danoBasicoEnfraquecido = Math.round(
          calcularDanoBasico(personagemAtual) *
            statusEffectService.multiplicadorDeDanoDeSaida(statusEffects.player),
        );
        const dano = aplicarMitigacaoDeDefesa(
          danoBasicoEnfraquecido,
          inimigoAtual,
        );

        inimigoAtual.vida_atual = Math.max(
          0,
          inimigoAtual.vida_atual - dano
        );

        log.push(
          `Você atacou e causou ${dano} de dano em ${inimigoAtual.nome}.`
        );
      }
    }

    // Fim do turno do JOGADOR (§23 passos 8/9) — decrementa cooldown e
    // duração de status do jogador, exceto o que acabou de entrar agora.
    cooldowns.player = cooldownService.decrementarCooldowns(cooldowns.player, cooldownsPlayerAplicadosNesteTurno);
    statusEffects.player = statusEffectService.decrementarDuracoes(statusEffects.player);

    // Snapshot de vida/mana logo após a AÇÃO do jogador (poder/item/
    // ataque), antes do contra-ataque do inimigo mais abaixo — sem
    // isso, o cliente só via o resultado LÍQUIDO do turno inteiro
    // (cura menos o dano que o inimigo causa em seguida), e uma cura
    // real podia ficar "invisível" na tela sempre que o contra-ataque
    // fosse maior que ela, mesmo com o log dizendo corretamente que a
    // poção funcionou. Devolvido em character.vida_apos_sua_acao pro
    // front mostrar a cura de verdade antes de aplicar o golpe do
    // inimigo por cima.
    const vidaAposAcaoJogador = personagemAtual.vida_atual;
    const manaAposAcaoJogador = personagemAtual.mana_atual;

    // ==========================================================
    // CHECA VITÓRIA
    // ==========================================================

    async function concederVitoriaEResponder() {
      // Encontro do Modo Aventura (tem id_area, ver
      // gerarInimigoParaPersonagem) usa recompensa/espólio de ZONA
      // (§11/§12/§13), com contadores de sessão persistidos por kill
      // (§16) — nunca o pool genérico. Encontro antigo (sem id_area,
      // criado antes deste deploy) cai no fallback de sempre.
      const ehEncontroDeZona = Boolean(inimigoAtual.id_area);
      let xpGanho;
      let dinheiroGanho;
      let espoliosDeZona = [];

      if (ehEncontroDeZona) {
        const recompensa = await concederRecompensaDeZona(character, inimigoAtual, transaction);
        xpGanho = recompensa.xpGanho;
        dinheiroGanho = recompensa.dinheiroGanho;
        espoliosDeZona = recompensa.espolios;
      } else {
        xpGanho = 15 + inimigoAtual.nivel * 8;
        dinheiroGanho = 5 + inimigoAtual.nivel * 4;
      }

      // Buffs de Guilda (§19/§20) — só em recompensas de Aventura, nunca
      // em transferências/vendas (§20). Bônus TOTAL do nível, não
      // cumulativo entre níveis.
      const bonusGuilda = await bonusesAtivosPara(character.id, transaction);
      if (bonusGuilda.xpPercentual > 0) {
        xpGanho = Math.round(xpGanho * (1 + bonusGuilda.xpPercentual / 100));
      }
      if (bonusGuilda.goldPercentual > 0) {
        dinheiroGanho = Math.round(dinheiroGanho * (1 + bonusGuilda.goldPercentual / 100));
      }

      // O personagem já está travado (LOCK.UPDATE) desde o início desta
      // mesma transação, em executarTurno — XP, dinheiro, vida, mana e o
      // fim do encontro saem todos num único save (dentro de
      // adicionarExperiencia), evitando perder uma recompensa se duas
      // vitórias do mesmo personagem forem processadas ao mesmo tempo
      // (double-click, duas abas).
      concederOuro(character, dinheiroGanho);
      character.vida_atual = personagemAtual.vida_atual;
      character.mana_atual = personagemAtual.mana_atual;
      character.ultima_atualizacao_vida = new Date();
      character.ultima_atualizacao_mana = new Date();
      character.encontro_pve = null;
      const resultadoXP = await adicionarExperiencia(characterId, xpGanho, {
        transaction,
        personagem: character,
      });

      // Se houve level up, adiciona ao log.
      if (resultadoXP.niveisGanhos > 0) {
        for (
          let i = 1;
          i <= resultadoXP.niveisGanhos;
          i++
        ) {
          const nivelSubido =
            resultadoXP.nivel -
            resultadoXP.niveisGanhos +
            i;

          log.push(
            `Seu personagem subiu para o nível ${nivelSubido}!`
          );
        }
      }

      log.push(
        `${inimigoAtual.nome} foi derrotado! Você ganhou ${xpGanho} de experiência e ${dinheiroGanho} moedas.`
      );

      // Loot: rola DEPOIS do save de dinheiro/vida acima já estar
      // decidido em memória (character.dinheiro já tem dinheiroGanho
      // somado) — se cair ouro bônus, soma em cima do mesmo campo, e o
      // character.save() abaixo persiste tudo junto numa vez só.
      // Encontro de zona já resolveu o espólio próprio dentro de
      // concederRecompensaDeZona (§14 — Aventura não deve puxar do
      // mesmo pool genérico de Material/drop).
      const drop = ehEncontroDeZona
        ? null
        : await rolarDropDeVitoria(character, inimigoAtual, transaction);
      if (drop?.tipo === "item") {
        log.push(`Você encontrou: ${drop.item.nome}!`);
      } else if (drop?.tipo === "ouro") {
        log.push(`Você também encontrou ${drop.dinheiro} moedas extras!`);
      }
      for (const espolio of espoliosDeZona) {
        log.push(`Você recolheu: ${espolio.nome} x${espolio.quantidade}!`);
      }

      const dinheiroGanhoTotal = dinheiroGanho + (drop?.tipo === "ouro" ? drop.dinheiro : 0);
      await registrarProgresso(character, "MatarInimigos", 1, transaction);
      await registrarProgresso(character, "GanharOuro", dinheiroGanhoTotal, transaction);
      const resultadoMorte = await registrarMorte(character.id, inimigoAtual.nome, transaction);
      // Perfil de Jogador (§23) — mesmo evento de abate alimenta
      // conquistas de caça e de Bestiário (descoberta/maestria mudam
      // junto com o abate).
      await achievementService.checkMonsterKillAchievements(character.id, transaction);
      await achievementService.checkBestiaryAchievements(character.id, transaction);

      // Bestiário — "mostrar benefícios da conclusão": só quando ESTE
      // abate foi a primeira derrota do monstro (resultadoMorte.descobertoAgora)
      // é sequer possível a zona ter acabado de fechar o Bestiário agora
      // (senão ela já estaria completa antes deste combate).
      let bestiarioCompletoAgora = null;
      if (ehEncontroDeZona && resultadoMorte.descobertoAgora && inimigoAtual.id_area) {
        const maestria = await calcularMaestriaDaRegiao(character.id, inimigoAtual.id_area, transaction);
        if (maestria.total > 0 && maestria.descobertos === maestria.total) {
          const zona = await AdventureZone.findByPk(inimigoAtual.id_area, { transaction });
          bestiarioCompletoAgora = {
            zona: { id: inimigoAtual.id_area, nome: zona?.nome ?? null },
            beneficiosPorNivel: BONUS_POR_NIVEL,
          };
        }
      }

      // Guilda dos Aventureiros (§23/§45) — mesmo evento real, agora
      // também alimentando contratos de Rank ativos. id_monstro/id_area
      // só existem em encontro de zona (ehEncontroDeZona) — contratos
      // de "matar monstro específico"/"matar na região" simplesmente
      // não avançam com um encontro legado, o que é o comportamento
      // certo (não tem como validar região/monstro sem esses IDs).
      await registrarProgressoContrato(
        character,
        "MatarInimigos",
        1,
        { id_monstro: inimigoAtual.id_monstro, id_area: inimigoAtual.id_area },
        transaction,
      );
      await registrarProgressoContrato(character, "GanharOuro", dinheiroGanhoTotal, {}, transaction);
      await registrarProgressoMissaoGuilda(character, "MatarInimigos", 1, transaction);
      await registrarProgressoMissaoGuilda(character, "GanharOuro", dinheiroGanhoTotal, transaction);

      await character.save({ transaction });

      return res.status(200).json({
        status: "success",

        data: {
          done: true,
          victory: true,

          log,

          character: {
            vida_atual:
              personagemAtual.vida_atual,

            mana_atual:
              personagemAtual.mana_atual,

            nivel:
              resultadoXP.nivel,

            experiencia:
              resultadoXP.experiencia,

            dinheiro: character.dinheiro,

            pontos_distribuir:
              resultadoXP.pontos_distribuir,
          },

          enemy: inimigoAtual,

          rewards: {
            experiencia: xpGanho,
            dinheiro: dinheiroGanho,
          },

          drop,
          espolios: espoliosDeZona,
          statusEffects,
          bestiarioCompletoAgora,
        },
      });
    }

    if (inimigoAtual.vida_atual <= 0) {
      return await concederVitoriaEResponder();
    }

    // ==========================================================
    // MOTOR DE STATUS/COOLDOWN — INÍCIO DO TURNO DO INIMIGO (§23
    // passos 1/2) — ticks de Burn/Bleed/Poison aplicados nele por
    // poderes do jogador podem matá-lo ANTES do contra-ataque.
    // ==========================================================
    inimigoAtual.vida_atual = statusEffectService.processarTicksDeInicio({
      vidaAtual: inimigoAtual.vida_atual,
      defensor: inimigoAtual,
      lista: statusEffects.enemy,
      log,
      nomeAlvo: inimigoAtual.nome,
    });

    if (inimigoAtual.vida_atual <= 0) {
      return await concederVitoriaEResponder();
    }

    // ==========================================================
    // TURNO DO INIMIGO
    // ==========================================================

    if (
      chanceDeEsquiva(
        personagemAtual,
        inimigoAtual
      )
    ) {
      log.push(
        `Você esquivou do ataque de ${inimigoAtual.nome}!`
      );
    } else {
      const danoRecebidoEnfraquecido = Math.round(
        Math.max(
          1,
          Math.round(
            inimigoAtual.dano_base *
              (0.85 + Math.random() * 0.3)
          )
        ) * statusEffectService.multiplicadorDeDanoDeSaida(statusEffects.enemy),
      );
      const danoRecebido = aplicarMitigacaoDeDefesa(
        danoRecebidoEnfraquecido,
        personagemAtual,
      );

      personagemAtual.vida_atual =
        Math.max(
          0,
          personagemAtual.vida_atual -
            danoRecebido
        );

      log.push(
        `${inimigoAtual.nome} atacou e causou ${danoRecebido} de dano em você.`
      );
    }

    // Fim do turno do INIMIGO (§23 passos 8/9) — decrementa cooldown
    // (hoje sempre vazio: monstro de PvE ainda não usa Power nenhuma,
    // só ataque básico — mas fica pronto) e duração de status dele.
    cooldowns.enemy = cooldownService.decrementarCooldowns(cooldowns.enemy, cooldownsEnemyAplicadosNesteTurno);
    statusEffects.enemy = statusEffectService.decrementarDuracoes(statusEffects.enemy);

    // ==========================================================
    // DERROTA DO PERSONAGEM
    // ==========================================================

    const derrotado =
      personagemAtual.vida_atual <= 0;

    if (derrotado) {
      log.push(
        "Você foi derrotado e precisa se recuperar antes de lutar de novo."
      );
    }

    character.vida_atual = derrotado ? 0 : personagemAtual.vida_atual;
    character.mana_atual = personagemAtual.mana_atual;
    character.ultima_atualizacao_vida = new Date();
    character.ultima_atualizacao_mana = new Date();
    // Combate derrotado encerra o encontro (precisa buscar um novo
    // inimigo pra tentar de novo); senão, persiste o estado atualizado
    // do inimigo (vida restante) E o estado de status/cooldown/turno
    // pro próximo turno (§37 — extensão do JSONB já existente).
    character.encontro_pve = derrotado
      ? null
      : { ...inimigoAtual, statusEffects, cooldowns, combatTurn };
    await character.save({ transaction });

    return res.status(200).json({
      status: "success",

      data: {
        done: derrotado,
        victory: false,

        log,

        character: {
          vida_atual: derrotado
            ? 0
            : personagemAtual.vida_atual,

          mana_atual:
            personagemAtual.mana_atual,

          // Só faz sentido como um passo intermediário quando o
          // combate CONTINUA — numa derrota o valor final já é 0 e o
          // inimigo não chega a contra-atacar de novo.
          vida_apos_sua_acao: derrotado ? 0 : vidaAposAcaoJogador,
          mana_apos_sua_acao: manaAposAcaoJogador,

          nivel: character.nivel,
          experiencia: character.experiencia,
          pontos_distribuir: character.pontos_distribuir,
        },

        enemy: inimigoAtual,
        statusEffects: derrotado ? { player: [], enemy: [] } : statusEffects,
        cooldowns: derrotado ? { player: {}, enemy: {} } : { player: cooldowns.player },
      },
    });
}