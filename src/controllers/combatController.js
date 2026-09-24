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
  resolverResultadoDeAcerto,
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
const { resolverEfeitosDeArmaNoHit } = require("../services/weaponEffectResolver");
const { definicaoDoStatus, ACTION_TYPE } = require("../config/statusEffectConfig");
const { calcularMaestriaDaRegiao } = require("../services/masteryService");
const AdventureZone = require("../models/AdventureZone");
const { BONUS_POR_NIVEL } = require("../config/bestiaryConfig");
const WeaponStatusEffect = require("../models/WeaponStatusEffect");
const { resolverModificadorParaEncontro, registrarMorteDaCacada } = require("../services/adventureHuntCombatService");

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

// Fila (pedido explícito do jogador, reafirmado depois de já ter sido
// mexido uma vez): o inimigo NÃO PODE se adaptar aos atributos de quem
// está caçando — nem aos dele, nem escalado relativo ao nível dele. Vida/
// dano/agilidade/velocidade do monstro são função SÓ do nível do
// monstro (nivelForcado, vindo da zona/expedição — nunca do jogador),
// sempre os mesmos pra qualquer personagem que enfrente aquele nível,
// com qualquer build/equipamento. Por isso um lvl 10 perde de verdade
// pra um monstro lvl 50 (e um lvl 50 bem construído arrasa um lvl 10) —
// é assim que deveria ser.
//
// Versão anterior tentava resolver "o javali nível 1 não pode ameaçar
// um jogador nível 107" com uma escala RELATIVA ao nível de quem
// caçava (calcularEscalaPorNivel, removida) por cima de uma BASE que
// ainda vinha dos atributos reais do próprio jogador (vidaMaximaDe/
// danoBasicoEsperado dele) — então dois personagens do MESMO nível,
// com equipamento diferente, ainda recebiam o "mesmo" monstro com
// vida_maxima/dano_base bem diferentes entre si. Substituída por um
// personagem de REFERÊNCIA que existe só na memória, construído do
// zero a partir do nível do monstro (nunca lido do banco, nunca vindo
// de quem está jogando) — mesma fórmula de vida/dano que o jogo já usa
// pro personagem de verdade (vidaMaximaDe/danoBasicoEsperado), só que
// alimentada com atributos assumidos (crescimento médio de pontos por
// nível), não os do jogador.
const ATRIBUTO_REFERENCIA_BASE = 2; // média dos 5 atributos iniciais de raça (~10 no total ÷ 5)
const ATRIBUTO_REFERENCIA_POR_NIVEL = 0.8; // PONTOS_POR_NIVEL (4, ver experienceService.js) ÷ 5 atributos

function statsDeReferenciaPorNivel(nivel) {
  const nivelValido = Math.max(1, nivel || 1);
  const atributo = Math.round(
    ATRIBUTO_REFERENCIA_BASE + ATRIBUTO_REFERENCIA_POR_NIVEL * (nivelValido - 1),
  );
  return {
    nivel: nivelValido,
    forca: atributo,
    vitalidade: atributo,
    agilidade: atributo,
    velocidade: atributo,
    inteligencia: atributo,
  };
}

// `nomeAlvo` é só o nome do monstro já sorteado (por
// sortearMonstroDaZona, no controller) — nunca uma escolha do jogador
// (removida a pedido dele: a Aventura agora é sempre 100% aleatória).
//
// `opcoes.nivelForcado` vem do Modo Aventura/Expedição (nível sorteado
// pela zona) e é o único nível que importa aqui — `jogador.nivel` só
// serve de fallback pra quem chamar sem forçar nível nenhum.
// `opcoes.multiplicadores` (do AdventureMonster) dão identidade de
// combate própria a cada criatura em cima da MESMA base fixa — nunca
// uma escala relativa a quem está caçando.
function gerarInimigo(jogador, nomeAlvo, opcoes = {}) {
  const { nivelForcado, multiplicadores } = opcoes;
  const mult = {
    vida: multiplicadores?.vida ?? 1,
    dano: multiplicadores?.dano ?? 1,
    agilidade: multiplicadores?.agilidade ?? 1,
    velocidade: multiplicadores?.velocidade ?? 1,
  };
  const nivel = Math.max(1, nivelForcado ?? jogador?.nivel ?? 1);
  const variacao = () => 0.9 + Math.random() * 0.2; // ±10%

  const referencia = statsDeReferenciaPorNivel(nivel);

  const vidaMaxima = Math.max(20, Math.round(vidaMaximaDe(referencia) * variacao() * mult.vida));
  const danoBase = Math.max(1, Math.round(danoBasicoEsperado(referencia) * variacao() * mult.dano));
  const agilidade = Math.max(1, Math.round(referencia.agilidade * variacao() * mult.agilidade));
  const velocidade = Math.max(1, Math.round(referencia.velocidade * variacao() * mult.velocidade));

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

// Mesma base fixa por nível de gerarInimigo acima, só que pro modo em
// grupo (Aventura em party — ver src/socket/partySocket.js): a vida do
// monstro escala com o TAMANHO do grupo (N aliados batem nele por
// rodada, então precisa aguentar os N golpes, não só o de um — quem já
// ajusta esse peso extra por cabeça é o `multiplicadores.vida` que o
// caller monta), mas o dano continua sendo o de UM monstro daquele
// nível (ele só ataca um aliado por vez). Nível/agilidade/velocidade
// usam a média do grupo só como fallback de exibição, nunca pra
// calibrar vida/dano.
function gerarInimigoDeGrupo(
  { tamanhoGrupo, nivelMedio, agilidadeMedia, velocidadeMedia },
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

  const referencia = statsDeReferenciaPorNivel(nivel);
  const tamanho = Math.max(1, tamanhoGrupo || 1);

  const vidaMaxima = Math.max(
    20,
    Math.round(vidaMaximaDe(referencia) * tamanho * variacao() * mult.vida),
  );
  const danoBase = Math.max(1, Math.round(danoBasicoEsperado(referencia) * variacao() * mult.dano));

  const agilidade = Math.max(1, Math.round((agilidadeMedia || referencia.agilidade) * variacao() * mult.agilidade));
  const velocidade = Math.max(1, Math.round((velocidadeMedia || referencia.velocidade) * variacao() * mult.velocidade));
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
exports.statsDeReferenciaPorNivel = statsDeReferenciaPorNivel;

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

      // Evolução do Motor de Status §32 (Performance) — captura os
      // efeitos de status da arma equipada UMA vez, no início do
      // encontro (mesmo princípio já usado pra dano_min/dano_max da
      // arma logo abaixo), pra executarTurno nunca consultar o banco a
      // cada hit. Arma sem nenhuma linha configurada = arma normal
      // (opt-in, §12.1).
      const efeitosDaArmaEquipada = jogadorEfetivo.arma_equipada?.id_item
        ? await WeaponStatusEffect.findAll({
            where: { id_item: jogadorEfetivo.arma_equipada.id_item, ativo: true },
            transaction,
          })
        : [];

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
      // Expansão Aventura Beta §29 — frontend resolve sprite por essa
      // chave, nunca mais por nome (null até a arte ser enviada, cai
      // no EnemySprite genérico). Setado aqui (não só embaixo, em
      // encontro_pve) porque a resposta deste endpoint usa `inimigo`
      // direto quando é um encontro NOVO — sem isso, sprite_key só
      // chegava no frontend a partir do 2º turno (a 1ª resposta saía
      // sem essa chave, mesmo o encontro persistido já tendo).
      // imagem_url é a foto estática entregue pro monstro (Bestiário/
      // Mapa) — passa a servir também de sprite de combate quando ainda
      // não existe sprite_key dedicado (monstro sem arte animada).
      inimigo.sprite_key = escolhido.monstro?.sprite_key ?? null;
      inimigo.imagem_url = escolhido.monstro?.imagem_url ?? null;

      // Caçadas §6 — compõe um SEGUNDO multiplicador por cima do perfil
      // normal, só no snapshot deste encontro e só se o alvo sorteado
      // bater com o alvo da Caçada Ativa do personagem. Nunca faz UPDATE
      // no AdventureMonster nem afeta outro jogador.
      const modificadorCacada = await resolverModificadorParaEncontro(character.id, escolhido.id_monstro, transaction);
      if (modificadorCacada) {
        inimigo.vida_maxima = Math.round(inimigo.vida_maxima * (1 + modificadorCacada.hpMultiplier));
        inimigo.vida_atual = inimigo.vida_maxima;
        inimigo.dano_base = Math.round(inimigo.dano_base * (1 + modificadorCacada.damageMultiplier));
        inimigo.huntTarget = true;
        inimigo.huntId = modificadorCacada.huntId;
        inimigo.huntDifficulty = modificadorCacada.difficulty;
        inimigo.huntDifficultyLabel = modificadorCacada.difficultyLabel;
      }

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
        armaEquipadaEfeitos: efeitosDaArmaEquipada.map((e) => ({
          status_key: e.status_key,
          chance_ppm: e.chance_ppm,
          duration_turns: e.duration_turns,
          potency_base: e.potency_base,
          potency_scale_attribute: e.potency_scale_attribute,
          potency_scale_value: e.potency_scale_value,
          trigger: e.trigger,
          ativo: e.ativo,
        })),
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
        // sprite_key/imagem_url já vêm de `...inimigo` (setados acima).
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

    // Motor de Status §6/§7 — política central de bloqueio de ação:
    // resolve de uma vez (inclusive a única rolagem de Paralyze do
    // turno) quais ACTION_TYPE o jogador não pode executar agora. Hard
    // control (Freeze/Stun/Paralyze bloqueado) nunca deixa a API
    // esperando uma ação impossível — o servidor consome o turno sem
    // mana/cooldown/item e segue o fluxo normal (§7), evitando deadlock.
    const controleDoTurnoJogador = statusEffectService.resolverAcoesBloqueadasDoTurno(
      statusEffects.player,
      combatTurn,
    );
    statusEffects.player = controleDoTurnoJogador.lista;
    const jogadorBloqueadoNesteTurno = controleDoTurnoJogador.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK);
    if (jogadorBloqueadoNesteTurno) {
      log.push(
        `Você está ${definicaoDoStatus(controleDoTurnoJogador.motivoBloqueioTotal).nomeUi} e não conseguiu agir neste turno!`,
      );
    }

    let poderUsado = null;
    let nivelHabilidadeUsada = 1;

    if (!jogadorBloqueadoNesteTurno) {

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

      // Motor de Status §11 — resolverEfeitosDoUso preserva `target`
      // (Self/Enemy) de cada linha configurada; quem decide em qual
      // lista aplicar é aqui, nunca descartado como antes.
      const efeitosConfigurados = await resolverEfeitosDoUso({
        power: poderUsado,
        personagemCaster: personagemAtual,
        casterActorId: "player",
        turno: combatTurn,
      });
      const efeitosEmSiMesmo = efeitosConfigurados.filter((e) => e.target === "Self");
      const efeitosNoInimigo = efeitosConfigurados.filter((e) => e.target !== "Self");

      // Efeito em Self não depende de acerto/esquiva — não existe
      // "esquivar do próprio buff". Aplica sempre que a Power é
      // efetivamente usada, dano ou não.
      for (const efeito of efeitosEmSiMesmo) {
        statusEffects.player = statusEffectService.aplicarStatus(statusEffects.player, efeito);
        log.push(`Você recebeu ${definicaoDoStatus(efeito.key).nomeUi} por ${efeito.remainingTurns} turno(s).`);
      }

      if (dano > 0) {
        const blindDoAtacante = statusEffects.player.find((s) => s.key === "BLIND");
        const resultadoAcerto = resolverResultadoDeAcerto({
          atacante: personagemAtual,
          defensor: inimigoAtual,
          blindPotency: blindDoAtacante?.potency ?? 0,
        });
        if (!resultadoAcerto.hit) {
          log.push(
            resultadoAcerto.reason === "BLIND_MISS"
              ? `Cego, você errou ${poderUsado.nome} contra ${inimigoAtual.nome}!`
              : `${inimigoAtual.nome} esquivou de ${poderUsado.nome}!`,
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

          // Freeze existente quebra por ESTE dano direto antes de
          // qualquer novo efeito do mesmo golpe ser aplicado (§18) —
          // um Freeze recém-aplicado por este mesmo golpe não é afetado
          // (ele só entra na lista depois, no loop abaixo).
          const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(statusEffects.enemy, danoMitigado);
          statusEffects.enemy = quebraFreeze.lista;
          if (quebraFreeze.quebrou) log.push(`${inimigoAtual.nome} descongelou com o impacto!`);

          // Efeitos de status configurados da Power (§19/§29-31), só os
          // de alvo Enemy — só rola/aplica quando o golpe de fato acerta.
          for (const efeito of efeitosNoInimigo) {
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
      const blindDoAtacante = statusEffects.player.find((s) => s.key === "BLIND");
      const resultadoAcerto = resolverResultadoDeAcerto({
        atacante: personagemAtual,
        defensor: inimigoAtual,
        blindPotency: blindDoAtacante?.potency ?? 0,
      });

      if (!resultadoAcerto.hit) {
        log.push(
          resultadoAcerto.reason === "BLIND_MISS"
            ? `Cego, você errou o ataque contra ${inimigoAtual.nome}!`
            : `${inimigoAtual.nome} esquivou do seu ataque!`,
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

        // Freeze existente no inimigo quebra por ESTE dano direto,
        // antes de qualquer proc de arma deste mesmo golpe (§18).
        const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(statusEffects.enemy, dano);
        statusEffects.enemy = quebraFreeze.lista;
        if (quebraFreeze.quebrou) log.push(`${inimigoAtual.nome} descongelou com o impacto!`);

        // Proc de arma (§13) — só em ataque básico bem-sucedido com dano
        // direto > 0; nunca em Power/DoT (checado por não ser chamado
        // desses caminhos). armaEquipadaEfeitos já veio pré-carregado no
        // início do encontro (zero N+1 por hit).
        const efeitosDaArma = personagemAtual.armaEquipadaEfeitos ?? [];
        if (efeitosDaArma.length > 0) {
          const novosEfeitosDeArma = resolverEfeitosDeArmaNoHit({
            efeitosDaArma,
            personagemCaster: personagemAtual,
            casterActorId: "player",
            itemId: personagemAtual.arma_equipada?.id_item ?? null,
            turno: combatTurn,
          });
          for (const efeito of novosEfeitosDeArma) {
            statusEffects.enemy = statusEffectService.aplicarStatus(statusEffects.enemy, efeito);
            const def = definicaoDoStatus(efeito.key);
            log.push(`Sua arma aplicou ${def.nomeUi} em ${inimigoAtual.nome} por ${efeito.remainingTurns} turno(s)!`);
          }
        }
      }
    }
    } // fecha `if (!jogadorBloqueadoNesteTurno)`

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

      // Caçadas §6.1/§16 — mesma vitória real, agora também alimentando
      // a Caçada Ativa (se o monstro derrotado for o alvo dela). ouro/
      // reputação de conclusão já ficam somados em `character`/na linha
      // de progresso aqui dentro; character.save() abaixo persiste tudo
      // junto (mesmo princípio do resto desta função).
      const huntUpdate = await registrarMorteDaCacada(character, inimigoAtual, transaction);
      if (huntUpdate?.completed) {
        log.push(
          `Caçada concluída! Você recebeu ${huntUpdate.goldReward} ouro e ${huntUpdate.reputationReward} de Reputação de Caçador.`,
        );
      }

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
          huntUpdate,
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

    // Mesma política central do jogador (§7 "se o inimigo estiver
    // bloqueado, seu contra-ataque deve ser pulado sem exigir chamada
    // adicional") — um Freeze/Stun/Paralyze que o jogador aplicou no
    // inimigo também precisa consumir o turno dele aqui, sem deadlock.
    const controleDoTurnoInimigo = statusEffectService.resolverAcoesBloqueadasDoTurno(statusEffects.enemy, combatTurn);
    statusEffects.enemy = controleDoTurnoInimigo.lista;
    const inimigoBloqueadoNesteTurno = controleDoTurnoInimigo.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK);

    if (inimigoBloqueadoNesteTurno) {
      log.push(
        `${inimigoAtual.nome} está ${definicaoDoStatus(controleDoTurnoInimigo.motivoBloqueioTotal).nomeUi} e não conseguiu agir!`,
      );
    } else {
      const blindDoInimigo = statusEffects.enemy.find((s) => s.key === "BLIND");
      const resultadoAcerto = resolverResultadoDeAcerto({
        atacante: inimigoAtual,
        defensor: personagemAtual,
        blindPotency: blindDoInimigo?.potency ?? 0,
      });

      if (!resultadoAcerto.hit) {
        log.push(
          resultadoAcerto.reason === "BLIND_MISS"
            ? `${inimigoAtual.nome}, cego, errou o ataque!`
            : `Você esquivou do ataque de ${inimigoAtual.nome}!`,
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

        // Freeze existente no jogador quebra por ESTE dano direto (§18).
        const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(statusEffects.player, danoRecebido);
        statusEffects.player = quebraFreeze.lista;
        if (quebraFreeze.quebrou) log.push("Você descongelou com o impacto!");
      }
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