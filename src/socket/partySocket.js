const { montarPayloadBatalha } = require("../contracts/partyPayloads");
const SOCKET_EVENTS = require("../contracts/socketEvents");
// src/socket/partySocket.js
//
// Party da Aventura (PvE em grupo): convite estilo Duelo ao vivo
// (pvpLiveSocket) + lobby com "pronto" estilo DDTank (só o anfitrião
// inicia quando todo mundo estiver pronto) + batalha em grupo (N
// aliados vs 1 monstro escalado pela força combinada do grupo).
//
// Tudo em memória do processo, igual o Duelo ao vivo — não precisa
// sobreviver a um restart do servidor (só o resultado final, XP/ouro/
// drop, é persistido no banco quando a batalha termina).
//
// De propósito SEM SOCKET_EVENTS.TRANSPORT.IDENTIFY próprio: reaproveita socket.characterId
// já setado pelo SOCKET_EVENTS.TRANSPORT.IDENTIFY do pvpLiveSocket — este módulo só atende
// conexões que já passaram por lá (o PvpSocketProvider do frontend é
// global, montado uma vez pra todo o dashboard, então characterId já
// está disponível antes de qualquer tela de Aventura usar isto). Ver o
// comentário equivalente em guildSocket.js sobre o motivo de NÃO usar
// SOCKET_EVENTS.TRANSPORT.IDENTIFY genérico quando o socket é outro — aqui não se aplica
// porque é a MESMA conexão, mas vale registrar o porquê.

const Character = require("../models/Character");
const AdventureZone = require("../models/AdventureZone");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonster = require("../models/AdventureMonster");
const MonsterStatusEffect = require("../models/MonsterStatusEffect");
const { sequelize } = require("../config/database");
const { resolverTurnoComStatus } = require("../services/duelEngine");
const { adicionarExperiencia } = require("../services/experienceService");
const { concederOuro } = require("../services/goldService");
const { rolarDropDeVitoria } = require("../services/dropService");
const { sortearMonstroDaZona } = require("../services/adventureRollService");
const { persistirEstadoFinalDoMembro, calcularPenalidadeDiferencaNivel } = require("../services/partyBattleService");
const { registrarProgressoContrato } = require("../services/adventureGuildObjectiveService");
const { custoManaEfetivo, resolverResultadoDeAcerto } = require("../services/combatFormulas");
const combatModifierService = require("../services/combatModifierService");
const powerRuntime = require("../services/powerCombatRuntime");
const combatBuffService = require("../services/combatBuffService");
const statusEffectService = require("../services/statusEffectService");
const { definicaoDoStatus, ACTION_TYPE } = require("../config/statusEffectConfig");
const {
  online,
  chaveOnline,
  carregarLutador,
  poderesPublicos,
  registrarAoIdentificar,
} = require("./pvpLiveSocket");
const partyBattleConfig = require("../config/partyBattleConfig");
const cooldownService = require("../services/cooldownService");
const monsterCombatAdapter = require("../services/monsterCombatAdapter");

// partyId -> { id, hostId, membros: Map<charId,{id,nome,classe,pronto}>, ordem: [charId] }
const grupos = new Map();
// characterId (string) -> partyId
const grupoPorPersonagem = new Map();
// characterId do convidado (string) -> { idConvidante, partyId, socketIdConvidante, timeoutHandle }
const convitesPendentes = new Map();

let proximoGrupoId = 1;
let proximaBatalhaId = 1;

// battleId -> batalha em andamento
const batalhas = new Map();
// characterId (string) -> battleId
const batalhaPorPersonagem = new Map();

function limparConvitePendente(idConvidado) {
  const chave = chaveOnline(idConvidado);
  const pendente = convitesPendentes.get(chave);
  if (pendente) {
    clearTimeout(pendente.timeoutHandle);
    convitesPendentes.delete(chave);
  }
}

function membrosPublicos(grupo) {
  return grupo.ordem
    .map((id) => grupo.membros.get(id))
    .filter(Boolean)
    .map((m) => ({ id: m.id, nome: m.nome, classe: m.classe, pronto: m.pronto }));
}

function emitirGrupoAtualizado(io, grupo) {
  io.to(`party:${grupo.id}`).emit(SOCKET_EVENTS.PARTY.GRUPO_ATUALIZADO, {
    partyId: grupo.id,
    hostId: grupo.hostId,
    membros: membrosPublicos(grupo),
  });
}

function removerDoGrupo(io, characterId) {
  const chave = chaveOnline(characterId);
  const partyId = grupoPorPersonagem.get(chave);
  if (!partyId) return;
  const grupo = grupos.get(partyId);
  if (!grupo) {
    grupoPorPersonagem.delete(chave);
    return;
  }

  grupo.membros.delete(chave);
  grupo.ordem = grupo.ordem.filter((id) => id !== chave);
  grupoPorPersonagem.delete(chave);

  const socketId = online.get(chave);
  const socketDoMembro = socketId ? io.sockets.sockets.get(socketId) : null;
  socketDoMembro?.leave(`party:${partyId}`);

  if (chave === grupo.hostId || grupo.membros.size === 0) {
    // Anfitrião saiu (ou o grupo esvaziou) — desfaz o grupo inteiro em
    // vez de promover outro membro a anfitrião: mais simples e previsível
    // (quem convidou é quem decide iniciar, ver spec do jogador).
    for (const idRestante of grupo.ordem) {
      grupoPorPersonagem.delete(idRestante);
    }
    io.to(`party:${partyId}`).emit(SOCKET_EVENTS.PARTY.GRUPO_DESFEITO, {
      motivo: chave === grupo.hostId ? "anfitriao_saiu" : "grupo_vazio",
    });
    grupos.delete(partyId);
  } else {
    emitirGrupoAtualizado(io, grupo);
  }
}

module.exports = function registerPartyHandlers(io) {
  // Convite de party some do estado do React no cliente (é só
  // `useState`, ver PvpSocketContext) assim que a página recarrega —
  // refresh, aba reaberta, queda de rede — mesmo que o convite continue
  // válido aqui no servidor dentro do prazo. Sem isso, o convidado nunca
  // mais via o convite (só o anfitrião via "expirou" bem depois), tanto
  // faz se ele tivesse respondido ou não. Reenvia com o tempo restante
  // (não o prazo cheio de novo) assim que o characterId dele se
  // identifica de novo em QUALQUER socket.
  registrarAoIdentificar((_io, socket, chave) => {
    const pendente = convitesPendentes.get(chave);
    if (!pendente) return;

    const restanteMs = pendente.criadoEm + partyBattleConfig.PRAZO_CONVITE_MS - Date.now();
    if (restanteMs <= 0) return;

    const grupo = grupos.get(pendente.partyId);
    const convidante = grupo?.membros.get(pendente.idConvidante);
    if (!grupo || !convidante) return;

    socket.emit(SOCKET_EVENTS.PARTY.CONVITE_RECEBIDO, {
      idConvidante: pendente.idConvidante,
      nomeConvidante: convidante.nome,
      partyId: grupo.id,
      membros: membrosPublicos(grupo),
      prazoSegundos: Math.ceil(restanteMs / 1000),
    });
  });

  io.on("connection", (socket) => {
    // Nomes dos jogadores online pra convidar — a UI só tinha o id (via
    // `online`, que só guarda characterId -> socketId) e mostrava
    // "Jogador #123" na lista de convite (bug reportado). Callback igual
    // SOCKET_EVENTS.PVP.LISTAR_ONLINE (pvpLiveSocket.js), só que também resolve nome.
    socket.on(SOCKET_EVENTS.PARTY.LISTAR_ONLINE, async (_payload, callback) => {
      if (typeof callback !== "function") return;
      const characterId = socket.characterId;
      const ids = Array.from(online.keys()).filter((id) => id !== characterId);
      if (ids.length === 0) return callback({ jogadores: [] });
      const personagens = await Character.findAll({
        where: { id: ids },
        attributes: ["id", "nome"],
      });
      callback({ jogadores: personagens.map((p) => ({ id: p.id, nome: p.nome })) });
    });

    // Criar o grupo antes de chamar qualquer um (pedido dos jogadores) —
    // antes, o grupo só nascia "de lado" na primeira chamada de convite
    // (party:convidar), e o anfitrião só via o lobby depois que ALGUÉM
    // aceitasse. Agora dá pra formar o grupo (só você) e já ver o lobby
    // pra ir chamando gente com calma, um de cada vez.
    socket.on(SOCKET_EVENTS.PARTY.CRIAR, async () => {
      const characterId = socket.characterId;
      if (!characterId) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Identifique seu personagem antes de criar um grupo." });
      }
      if (grupoPorPersonagem.has(characterId) || batalhaPorPersonagem.has(characterId)) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você já está em outro grupo ou em batalha." });
      }

      const anfitriao = await Character.findByPk(characterId, { attributes: ["id", "nome"] });
      if (!anfitriao) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Personagem não encontrado." });
      }

      const grupo = {
        id: proximoGrupoId++,
        hostId: characterId,
        membros: new Map(),
        ordem: [],
      };
      grupo.membros.set(characterId, { id: anfitriao.id, nome: anfitriao.nome, classe: null, pronto: false });
      grupo.ordem.push(characterId);
      grupos.set(grupo.id, grupo);
      grupoPorPersonagem.set(characterId, grupo.id);
      socket.join(`party:${grupo.id}`);

      emitirGrupoAtualizado(io, grupo);
    });

    socket.on(SOCKET_EVENTS.PARTY.CONVIDAR, async ({ idConvidado } = {}) => {
      const idConvidante = socket.characterId;
      if (!idConvidante) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Identifique seu personagem antes de convidar." });
      }
      const chaveConvidado = chaveOnline(idConvidado);
      if (!idConvidado || chaveConvidado === idConvidante) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Escolha um amigo válido pra convidar." });
      }
      if (!online.has(chaveConvidado)) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Esse jogador não está online agora." });
      }
      if (grupoPorPersonagem.has(chaveConvidado) || batalhaPorPersonagem.has(chaveConvidado)) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Esse jogador já está em outro grupo ou em batalha." });
      }
      if (batalhaPorPersonagem.has(idConvidante)) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você já está numa batalha em grupo." });
      }
      if (convitesPendentes.has(chaveConvidado)) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Esse jogador já tem um convite pendente." });
      }

      let grupo = grupos.get(grupoPorPersonagem.get(idConvidante));
      if (!grupo) {
        grupo = {
          id: proximoGrupoId++,
          hostId: idConvidante,
          membros: new Map(),
          ordem: [],
        };
        grupos.set(grupo.id, grupo);
      } else if (grupo.hostId !== idConvidante) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Só o anfitrião do grupo pode chamar mais gente." });
      }

      if (grupo.emBatalha) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Não dá pra chamar mais gente com o grupo em batalha." });
      }

      if (grupo.membros.size >= partyBattleConfig.TAMANHO_MAXIMO_GRUPO) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: `O grupo já está cheio (máximo ${partyBattleConfig.TAMANHO_MAXIMO_GRUPO}).` });
      }

      // Anfitrião entra no próprio grupo já na primeira chamada (antes
      // dele só existir "na cabeça" do convite).
      if (!grupo.membros.has(idConvidante)) {
        const anfitriao = await Character.findByPk(idConvidante, { attributes: ["id", "nome"] });
        if (!anfitriao) {
          grupos.delete(grupo.id);
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Personagem não encontrado." });
        }
        grupo.membros.set(idConvidante, { id: anfitriao.id, nome: anfitriao.nome, classe: null, pronto: false });
        grupo.ordem.push(idConvidante);
        grupoPorPersonagem.set(idConvidante, grupo.id);
        socket.join(`party:${grupo.id}`);
      }

      const convidante = grupo.membros.get(idConvidante);
      const socketIdConvidado = online.get(chaveConvidado);
      const timeoutHandle = setTimeout(() => {
        limparConvitePendente(chaveConvidado);
        socket.emit(SOCKET_EVENTS.PARTY.CONVITE_EXPIRADO, { idConvidado: chaveConvidado });
        io.to(socketIdConvidado).emit(SOCKET_EVENTS.PARTY.CONVITE_CANCELADO, { idConvidante });
      }, partyBattleConfig.PRAZO_CONVITE_MS);

      convitesPendentes.set(chaveConvidado, {
        idConvidante,
        partyId: grupo.id,
        socketIdConvidante: socket.id,
        timeoutHandle,
        criadoEm: Date.now(),
      });

      socket.emit(SOCKET_EVENTS.PARTY.CONVITE_ENVIADO, { idConvidado: chaveConvidado, prazoSegundos: partyBattleConfig.PRAZO_CONVITE_MS / 1000 });
      io.to(socketIdConvidado).emit(SOCKET_EVENTS.PARTY.CONVITE_RECEBIDO, {
        idConvidante,
        nomeConvidante: convidante.nome,
        partyId: grupo.id,
        membros: membrosPublicos(grupo),
        prazoSegundos: partyBattleConfig.PRAZO_CONVITE_MS / 1000,
      });
    });

    socket.on(SOCKET_EVENTS.PARTY.RESPONDER_CONVITE, async ({ aceitar } = {}) => {
      const idConvidado = socket.characterId;
      if (!idConvidado) return;
      const pendente = convitesPendentes.get(idConvidado);
      if (!pendente) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Esse convite não existe mais." });
      }
      limparConvitePendente(idConvidado);

      if (!aceitar) {
        io.to(pendente.socketIdConvidante).emit(SOCKET_EVENTS.PARTY.CONVITE_RECUSADO, { idConvidado });
        return;
      }

      const grupo = grupos.get(pendente.partyId);
      if (!grupo) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Esse grupo não existe mais." });
      }
      if (grupo.membros.size >= partyBattleConfig.TAMANHO_MAXIMO_GRUPO) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "O grupo ficou cheio antes de você aceitar." });
      }
      if (grupoPorPersonagem.has(idConvidado) || batalhaPorPersonagem.has(idConvidado)) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você já está em outro grupo ou em batalha." });
      }

      const personagem = await Character.findByPk(idConvidado, { attributes: ["id", "nome"] });
      if (!personagem) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Personagem não encontrado." });
      }

      grupo.membros.set(idConvidado, { id: personagem.id, nome: personagem.nome, classe: null, pronto: false });
      grupo.ordem.push(idConvidado);
      grupoPorPersonagem.set(idConvidado, grupo.id);
      socket.join(`party:${grupo.id}`);

      emitirGrupoAtualizado(io, grupo);
    });

    socket.on(SOCKET_EVENTS.PARTY.PRONTO, ({ pronto } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const partyId = grupoPorPersonagem.get(characterId);
      if (!partyId) return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você não está em nenhum grupo." });
      const grupo = grupos.get(partyId);
      if (!grupo) return;
      const membro = grupo.membros.get(characterId);
      if (!membro) return;
      membro.pronto = Boolean(pronto);
      emitirGrupoAtualizado(io, grupo);
    });

    socket.on(SOCKET_EVENTS.PARTY.SAIR, () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      removerDoGrupo(io, characterId);
    });

    // Remover alguém do grupo (só o anfitrião) — igual convidar mais
    // gente, funciona a qualquer momento antes da batalha começar, não
    // só na tela de montar o grupo.
    socket.on(SOCKET_EVENTS.PARTY.EXPULSAR, ({ idAlvo } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const partyId = grupoPorPersonagem.get(characterId);
      if (!partyId) return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você não está em nenhum grupo." });
      const grupo = grupos.get(partyId);
      if (!grupo) return;
      if (grupo.hostId !== characterId) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Só o anfitrião pode remover alguém do grupo." });
      }
      if (grupo.emBatalha) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Não dá pra remover alguém com o grupo em batalha." });
      }
      const chaveAlvo = chaveOnline(idAlvo);
      if (chaveAlvo === characterId) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: 'Use "Sair do grupo" pra sair você mesmo.' });
      }
      if (!grupo.membros.has(chaveAlvo)) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Esse jogador não está mais no grupo." });
      }

      grupo.membros.delete(chaveAlvo);
      grupo.ordem = grupo.ordem.filter((id) => id !== chaveAlvo);
      grupoPorPersonagem.delete(chaveAlvo);

      const socketIdAlvo = online.get(chaveAlvo);
      const socketDoAlvo = socketIdAlvo ? io.sockets.sockets.get(socketIdAlvo) : null;
      socketDoAlvo?.leave(`party:${partyId}`);
      socketDoAlvo?.emit(SOCKET_EVENTS.PARTY.EXPULSO, { partyId });

      emitirGrupoAtualizado(io, grupo);
    });

    socket.on(SOCKET_EVENTS.PARTY.INICIAR, async ({ idZona } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const partyId = grupoPorPersonagem.get(characterId);
      if (!partyId) return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você não está em nenhum grupo." });
      const grupo = grupos.get(partyId);
      if (!grupo) return;
      if (grupo.hostId !== characterId) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Só o anfitrião pode iniciar a aventura." });
      }
      if (grupo.emBatalha) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "O grupo já está em batalha." });
      }
      if (grupo.membros.size < partyBattleConfig.TAMANHO_MINIMO_GRUPO) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: `Precisa de pelo menos ${partyBattleConfig.TAMANHO_MINIMO_GRUPO} aventureiros pra formar um grupo.` });
      }
      const naoProntos = grupo.ordem.filter((id) => !grupo.membros.get(id)?.pronto);
      if (naoProntos.length > 0) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Ainda tem gente que não marcou 'pronto'." });
      }

      try {
        await require("../services/worldCrisisAccessService").assertAccessible("ADVENTURE_ZONE",idZona);
        const zona = await AdventureZone.findByPk(idZona);
        if (!zona) {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Área de caça inválida." });
        }
        const monstrosDaZona = await AdventureZoneMonster.findAll({
          where: { id_area: zona.id, ativo: true },
          // Mesmo fix de combatController.js — ativo:true só no vínculo
          // não impede um monstro DESATIVADO globalmente de continuar
          // sendo sorteado pra batalha em grupo.
          include: [{ model: AdventureMonster, as: "monstro", where: { ativo: true }, required: true }],
        });
        if (monstrosDaZona.length === 0) {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Área de Caça sem monstros configurados." });
        }

        // vidaCheia: false — batalha de grupo entra com a vida/mana REAL
        // de cada um (bug reportado: iniciar a party curava geral de
        // graça, mesmo pra quem já estava machucado). Ver comentário em
        // carregarLutador (pvpLiveSocket.js) sobre por que Duelo/
        // Ranqueado/Torneio continuam entrando com vida cheia normalmente.
        // Proezas Únicas §11 — Party é PERMITIDO pra Legado (a menos que
        // o UniquePowerEffect específico diga o contrário via
        // allow_party), então passa o contexto certo em vez de deixar
        // cair no default de duelo casual.
        const membros = await Promise.all(
          grupo.ordem.map((id) => carregarLutador(id, { vidaCheia: false, contexto: "PARTY" })),
        );
        if (membros.some((m) => !m)) {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Não foi possível carregar todos os personagens do grupo." });
        }
        // Motor de Status (mesmo princípio do Duelo ao vivo/PvE solo) —
        // lista de instâncias ATIVAS de cada aliado, vazia no início do
        // encontro; `armaEfeitos` já veio pronto de carregarLutador.
        for (const membro of membros) {
          membro.status = [];
          // Buffs de combate (ConsumableEffect APPLY_COMBAT_BUFF — spec
          // Caldeirão §13) — mesmo princípio do `status` acima.
          membro.combatBuffs = [];
        }
        const derrotados = membros.filter((m) => m.estado.vida_atual <= 0);
        if (derrotados.length > 0) {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, {
            mensagem: `${derrotados.map((m) => m.nome).join(", ")} está derrotado e precisa se recuperar antes de entrar em batalha.`,
          });
        }

        // Reformulação V2 dos Monstros (§4.3) — nivel_jogador_minimo só
        // decide ELEGIBILIDADE de aparição; usa o nível do membro MAIS
        // BAIXO do grupo, então um vínculo só entra no pool se TODO
        // mundo já pode enfrentá-lo, não só a média.
        const menorNivelDoGrupo = Math.min(...membros.map((m) => m.estado.nivel || 1));

        // Gate de ENTRADA na zona (pedido do jogador, mesmo campo que
        // adventureService.entrarNaZona usa na Aventura solo) — usa o
        // mesmo critério "todo mundo precisa poder entrar" do filtro de
        // monstro logo abaixo, nunca só a média do grupo.
        if (menorNivelDoGrupo < zona.nivel_jogador_minimo) {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, {
            mensagem: `O grupo precisa ter todo mundo nível ${zona.nivel_jogador_minimo}+ pra entrar em "${zona.nome}".`,
          });
        }

        const monstrosElegiveis = monstrosDaZona.filter(
          (zm) => menorNivelDoGrupo >= (zm.nivel_jogador_minimo ?? 1),
        );
        if (monstrosElegiveis.length === 0) {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, {
            mensagem: "Nenhuma criatura dessa Área de Caça está disponível pro nível do grupo ainda.",
          });
        }

        // Pedido do jogador: calcula a penalidade ANTES de sortear o
        // monstro (não depende dele, só da diferença de nível dentro do
        // grupo), guardada na `batalha` pra ser aplicada na recompensa
        // quando a luta terminar (finalizarBatalha).
        const penalidadeDiferencaNivel = calcularPenalidadeDiferencaNivel({
          niveisDosMembros: membros.map((m) => m.estado.nivel),
          config: partyBattleConfig,
        });

        const escolhido = sortearMonstroDaZona(monstrosElegiveis);
        const monstro = escolhido.monstro;

        // Reformulação V2 dos Monstros (§9) — Party usa os MESMOS stats
        // fixos do monstro, sem sorteio de nível nem RNG de variação.
        // O único modificador CONTEXTUAL (nunca persistido em
        // AdventureMonster) é a escala pelo TAMANHO do grupo: N aliados
        // batem nele por rodada, então precisa aguentar os N golpes —
        // esse bônus extra, por cabeça além do mínimo de
        // partyBattleConfig.TAMANHO_MINIMO_GRUPO, empilha em cima disso um pouco mais de
        // vida e dano (moderado — o resto do design já favorece ir em
        // grupo: XP/ouro cheios pra todo mundo, não divididos).
        const tamanhoGrupo = Math.max(1, membros.length);
        const aventureirosExtras = Math.max(0, grupo.ordem.length - partyBattleConfig.TAMANHO_MINIMO_GRUPO);
        const fatorDificuldadeGrupo = {
          vida: 1 + aventureirosExtras * partyBattleConfig.FATOR_DIFICULDADE_VIDA_POR_EXTRA,
          dano: 1 + aventureirosExtras * partyBattleConfig.FATOR_DIFICULDADE_DANO_POR_EXTRA,
        };

        const vidaMaxima = Math.max(
          20,
          Math.round(monstro.vida_maxima * tamanhoGrupo * fatorDificuldadeGrupo.vida),
        );
        const danoMin = Math.max(0, Math.round(monstro.dano_min * fatorDificuldadeGrupo.dano));
        const danoMax = Math.max(danoMin, Math.round(monstro.dano_max * fatorDificuldadeGrupo.dano));

        const inimigo = {
          // Guilda dos Aventureiros (§23/§45) — id do catálogo, preservado
          // pra poder alimentar contrato de Rank "matar monstro
          // específico"/"matar na região" na vitória (finalizarBatalha),
          // mesmo critério do encontro solo (combatController.js).
          id_monstro: monstro.id,
          nome: monstro.nome,
          nivel: monstro.nivel,
          forca: Math.max(1, Math.round((danoMin + danoMax) / 2)),
          vitalidade: Math.max(1, Math.round(vidaMaxima / 5)),
          agilidade: monstro.agilidade,
          velocidade: monstro.velocidade,
          vida_maxima: vidaMaxima,
          vida_atual: vidaMaxima,
          dano_min: danoMin,
          dano_max: danoMax,
          // Especificação "Admin de Aventura + Defesa/Poder de Monstros"
          // v3 (§12.1) — Defesa NUNCA escala com fatorDificuldadeGrupo
          // (só vida/dano escalam por tamanho de grupo); preservada tal
          // qual configurada no catálogo.
          defesa: monstro.defesa ?? 0,
          combatTyping: (await require("../services/combatTypingService").catalog(),require("../services/combatTypingService").monsterProfile(monstro)),
          xp_recompensa: monstro.xp_recompensa,
          ouro_recompensa: monstro.ouro_recompensa,
        };
        // imagem_url serve de sprite de combate (sprite_key fixo foi
        // removido, ver AdventureMonster.js).
        inimigo.imagem_url = monstro.imagem_url ?? null;

        // Motor de Status (mesmo princípio do PvE solo em
        // combatController.js) — captura os efeitos de status
        // configurados no monstro UMA vez, no início da batalha, pra
        // executarTurnoMonstro nunca consultar o banco a cada golpe.
        // `status` é a lista de instâncias ATIVAS nele, vazia no início.
        const efeitosDeStatusDoMonstro = await MonsterStatusEffect.findAll({
          where: { id_monstro: monstro.id, ativo: true },
        });
        inimigo.efeitosDeStatus = efeitosDeStatusDoMonstro.map((e) => ({
          status_key: e.status_key,
          chance_ppm: e.chance_ppm,
          duration_turns: e.duration_turns,
          potency_base: e.potency_base,
          percentual_vida_maxima: e.percentual_vida_maxima,
          ativo: e.ativo,
        }));
        inimigo.status = [];
        inimigo.combatBuffs = [];

        // IA de Combate PvE & Habilidades de Monstros V1 (§8.2) — mesmo
        // princípio de efeitosDeStatus acima: pré-carrega MonsterAbility
        // UMA vez, no início da batalha. Monstro sem nenhuma ability ativa
        // = array vazio = combatAiService.chooseAction sempre devolve
        // "attack" (comportamento 100% legado, §12.1). `cooldowns` é novo
        // SÓ pro monstro (Party não rastreia cooldown de Power nenhum
        // hoje, nem do lado dos aliados) — nunca afeta Powers de jogador.
        inimigo.habilidades = await monsterCombatAdapter.construirHabilidadesParaEncontro(monstro.id, {
          capabilidadesExecutaveis: monsterCombatAdapter.CAPABILITIES_EXECUTAVEIS_PARTY_V1,
        });
        inimigo.ai_profile = monstro.ai_profile ?? "BASIC";
        inimigo.cooldowns = {};

        const battleId = proximaBatalhaId++;
        const sala = `party-batalha:${battleId}`;
        const batalha = {
          id: battleId,
          sala,
          partyId,
          zona: { id: zona.id, nome: zona.nome },
          ordem: grupo.ordem.slice(),
          membros: new Map(membros.map((m) => [chaveOnline(m.id), m])),
          inimigo,
          turnoIndex: 0,
          fase: "aliados", // "aliados" (percorrendo a ordem) | "monstro"
          rodada: 1,
          timer: null,
          processandoAcao: false,
          penalidadeDiferencaNivel,
          // Motor de Status — contador monotônico de turnos reais da
          // batalha (aliado OU monstro agindo), nunca reaproveitado nem
          // zerado por rodada: é o que resolverTurnoComStatus usa pra
          // nunca rerrolar Paralyze duas vezes no mesmo turno de quem já
          // agiu (mesmo papel de duelo.acoes no Duelo ao vivo).
          contadorTurno: 0,
        };
        batalhas.set(battleId, batalha);
        for (const id of grupo.ordem) {
          batalhaPorPersonagem.set(id, battleId);
        }

        const socketsDoGrupo = io.sockets.adapter.rooms.get(`party:${partyId}`);
        for (const socketId of socketsDoGrupo || []) {
          io.sockets.sockets.get(socketId)?.join(sala);
        }

        // O grupo continua existindo durante a batalha (só trava convite/
        // expulsão/novo início enquanto emBatalha) — antes ele era
        // apagado aqui, e como nada o recriava depois, terminar uma
        // aventura em grupo desfazia o grupo inteiro mesmo sem o
        // anfitrião ter saído (bug reportado). Ele volta pro lobby (ver
        // finalizarBatalha) quando a batalha termina.
        grupo.emBatalha = true;

        io.to(sala).emit(SOCKET_EVENTS.PARTY.BATALHA_INICIADA, montarPayloadBatalha(batalha));

        iniciarTimerDeTurnoGrupo(io, battleId);
      } catch (error) {
        console.error("Erro ao iniciar batalha em grupo:", error);
        socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Não foi possível iniciar a aventura em grupo." });
      }
    });

    socket.on(SOCKET_EVENTS.PARTY.ACAO, async ({ tipo, idPoder, idItem } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const battleId = batalhaPorPersonagem.get(characterId);
      if (!battleId) return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você não está em nenhuma batalha." });
      const batalha = batalhas.get(battleId);
      if (!batalha) return;
      if (batalha.processandoAcao || batalha.resolvendoTurno) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Aguarde, a última ação ainda está sendo processada." });
      }
      if (batalha.fase !== "aliados" || batalha.ordem[batalha.turnoIndex] !== characterId) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Ainda não é o seu turno." });
      }

      const atacante = batalha.membros.get(characterId);
      if (!atacante || atacante.estado.vida_atual <= 0) {
        return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você não pode agir derrotado." });
      }

      let acao = { tipo: "attack" };
      if (tipo === "power") {
        const power = atacante.poderes.find((p) => p.id === Number(idPoder));
        if (!power) return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Poder inválido." });
        if (power.tipo_poder !== "Ativo") {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Este poder não pode ser usado manualmente em combate." });
        }
        if (custoManaEfetivo(power, power.nivel_habilidade ?? 1) > atacante.estado.mana_atual) {
          return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Mana insuficiente para esse poder." });
        }
        acao = { tipo: "power", power };
      } else if (tipo === "item") {
        batalha.processandoAcao = true;
        try {
          const consumivel = atacante.consumiveis.find((c) => c.id_item === Number(idItem));
          if (!consumivel || consumivel.quantidade < 1) {
            return socket.emit(SOCKET_EVENTS.PARTY.ERRO, { mensagem: "Você não possui esse item no inventário." });
          }
          acao = {
            tipo: "item",
            item: { nome: consumivel.nome },
            efeito: { efeito_vida: consumivel.efeito_vida, efeito_mana: consumivel.efeito_mana },
            efeitosConsumiveisModernos: consumivel.efeitos_modernos ?? [],
          };
        } finally {
          batalha.processandoAcao = false;
        }
      } else if (tipo === "pass") {
        // Bug relatado: atordoado/congelado, o jogador não tinha ação
        // nenhuma disponível e ficava travado no turno infinitamente —
        // "pass" é sempre liberado (statusEffectConfig.js/duelEngine.js),
        // pro jogador decidir não usar item nenhum e só passar o turno.
        acao = { tipo: "pass" };
      }

      await executarTurnoAliado(io, battleId, characterId, acao);
    });

    // Resync após F5/reconexão (bug reportado: luta em grupo continuava
    // rodando no servidor, mas a tela nunca repovoava sozinha — só
    // existia o evento de INÍCIO da luta, que dispara uma única vez).
    // Mesmo princípio de guildboss:entrar (guildBossSocket.js): se este
    // personagem já está numa batalha de grupo em andamento, reentra na
    // sala e manda o estado ATUAL (não o inicial) pro socket novo.
    socket.on(SOCKET_EVENTS.PARTY.ENTRAR_BATALHA, () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const battleId = batalhaPorPersonagem.get(characterId);
      if (!battleId) return;
      const batalha = batalhas.get(battleId);
      if (!batalha) return;
      socket.join(batalha.sala);
      socket.emit(SOCKET_EVENTS.PARTY.BATALHA_ESTADO, montarPayloadBatalha(batalha));
    });

    socket.on("disconnect", () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      // Só trata como saída real se este ainda é o socket "dono" do
      // personagem (mesma cautela do pvpLiveSocket: um socket novo pro
      // mesmo characterId já assumiu `online` antes desse handler rodar,
      // de forma síncrona, antes do disconnect do socket antigo disparar
      // — de forma assíncrona). Condição estava invertida (bug reportado:
      // aceitar convite de grupo e cair sozinho da party) — comparava
      // igual quando devia comparar diferente, então QUALQUER reconexão
      // (ex.: o próprio socket.io reconectando durante a navegação pra
      // "/dashboard/adventure" logo após aceitar o convite) fazia o
      // socket antigo, já substituído, expulsar o personagem de um grupo
      // que ele nunca chegou a sair de verdade.
      const eraSocketAtivo = online.get(characterId) === socket.id;
      if (!eraSocketAtivo) return;
      removerDoGrupo(io, characterId);
      sairDaBatalhaPorDesconexao(io, characterId);
    });
  });
};

function iniciarTimerDeTurnoGrupo(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);
  batalha.timer = setTimeout(() => {
    if (batalha.fase !== "aliados") return;
    const characterId = batalha.ordem[batalha.turnoIndex];
    const atacante = batalha.membros.get(characterId);
    if (!atacante || atacante.estado.vida_atual <= 0) {
      avancarTurnoAliado(io, battleId);
      return;
    }
    executarTurnoAliado(io, battleId, characterId, { tipo: "attack" }, true);
  }, partyBattleConfig.PRAZO_TURNO_MS);
}

async function executarTurnoAliado(io, battleId, characterId, acao, foiAutomatico = false) {
  const current = batalhas.get(battleId);
  if (!current) return;
  if (current.resolvendoTurno || current.fase !== "aliados" || current.ordem[current.turnoIndex] !== characterId) return;
  current.resolvendoTurno = true;
  try { return await executarTurnoAliadoSemGuard(io, battleId, characterId, acao, foiAutomatico); }
  finally { current.resolvendoTurno = false; }
}

async function executarTurnoAliadoSemGuard(io, battleId, characterId, acao, foiAutomatico = false) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);

  const atacante = batalha.membros.get(characterId);
  batalha.contadorTurno += 1;

  // Habilidades V2.0 §7/§9/§11/§26 (Fase 5) — modificadores PASSIVOS do
  // aliado que agiu, mesmo contexto PARTY do teto de DoT. O monstro
  // nunca tem CharacterAbilities — resolverModificadoresDoPersonagem só
  // é chamado pro lado que É de verdade um Character, igual ao PvE
  // solo nunca resolve isso pro inimigo.
  const modificadoresAtacante = await combatModifierService.resolverModificadoresDoPersonagem(
    atacante.estado,
    "PARTY",
  );
  // Item 7 — gatilhos reativos ON_HIT/ON_KILL do aliado, mesmo princípio.
  const gatilhosAtacante = await combatModifierService.resolverGatilhosDoPersonagem(atacante.estado, "PARTY");

  const source = powerRuntime.participant(atacante.estado, {
    key: characterId, team: "allies", triggers: gatilhosAtacante, modifiers: modificadoresAtacante,
    hpMax: atacante.vidaMax, mpMax: atacante.manaMax, status: atacante.status, cooldowns: atacante.cooldowns,
  });
  const enemy = powerRuntime.participant(batalha.inimigo, { key: "enemy", team: "enemies",
    status: batalha.inimigo.status, hpMax: batalha.inimigo.vida_maxima, cooldowns: batalha.inimigo.cooldowns });
  const otherAllies = [...batalha.membros.values()].filter((m) => m !== atacante).map((m) =>
    powerRuntime.participant(m.estado, { key: m.id, team: "allies", status: m.status,
      hpMax: m.vidaMax, mpMax: m.manaMax, cooldowns: m.cooldowns }));
  const runtime = [source, enemy, ...otherAllies];
  // Motor de Status (Evolução do Motor de Status) — mesma engrenagem do
  // Duelo ao vivo/PvE solo: ticks de DoT no FIM do turno de quem agiu
  // (nunca na hora do golpe que aplicou o status), bloqueio de ação por
  // controle duro/Silêncio, Enfraquecimento/Cegueira, proc de arma do
  // aliado no monstro quando o ataque básico acerta.
  const {
    nomeAcao,
    damageResolution,
    dano,
    cura,
    manaCurada,
    esquivou,
    critico,
    bloqueado,
    statusAtacante,
    statusDefensor,
    buffsAtacante,
    log: logStatus,
  } = await resolverTurnoComStatus({
    atacante: atacante.estado,
    defensor: batalha.inimigo,
    acao,
    vidaMaxAtacante: atacante.vidaMax,
    manaMaxAtacante: atacante.manaMax,
    statusAtacante: atacante.status,
    statusDefensor: batalha.inimigo.status,
    buffsAtacante: atacante.combatBuffs,
    buffsDefensor: batalha.inimigo.combatBuffs,
    turno: batalha.contadorTurno,
    casterActorId: characterId,
    armaEfeitosAtacante: atacante.armaEfeitos,
    itemIdArmaAtacante: atacante.estado.arma_equipada?.id_item ?? null,
    nomeAtacante: atacante.nome,
    nomeDefensor: batalha.inimigo.nome,
    modificadoresAtacante,
    gatilhosAtacante,
    runtime,
    contexto: "PARTY",
  });
  for (const m of batalha.membros.values()) {
    const p = runtime.find((p) => p.actor === m.estado);
    if (p && m !== atacante) m.status = p.status;
  }
  atacante.status = statusAtacante;
  batalha.inimigo.status = statusDefensor;
  atacante.combatBuffs = buffsAtacante ?? atacante.combatBuffs;

  io.to(batalha.sala).emit(SOCKET_EVENTS.PARTY.TURNO_RESULTADO, {
    battleId,
    origem: "aliado",
    idAtor: characterId,
    nomeAcao: bloqueado ? nomeAcao : foiAutomatico ? `${nomeAcao} (tempo esgotado)` : nomeAcao,
    damageResolution,
    dano,
    cura,
    manaCurada,
    esquivou,
    critico: Boolean(critico),
    bloqueado: Boolean(bloqueado),
    logStatus,
    vidaInimigo: batalha.inimigo.vida_atual,
    vidaAliado: atacante.estado.vida_atual,
    manaAliado: atacante.estado.mana_atual,
    rodada: batalha.rodada,
    statusInimigo: snapshotStatus(batalha.inimigo.status),
    statusAliados: snapshotStatusAliados(batalha),
    combatBuffsInimigo: snapshotCombatBuffs(batalha.inimigo.combatBuffs),
    combatBuffsAliados: snapshotCombatBuffsAliados(batalha),
  });

  if (batalha.inimigo.vida_atual <= 0) {
    return finalizarBatalha(io, battleId, true);
  }

  avancarTurnoAliado(io, battleId);
}

// Batalha em grupo não tem reconexão própria ainda (v1) — quem cai é
// tratado como derrotado pra fins de turno (pulado pela mesma checagem
// de "vivo" que já existe pro resto do combate), sem travar o resto do
// grupo esperando a vez de alguém que não vai mais agir. Sem isso, o
// personagem ficava preso em `batalhaPorPersonagem` pra sempre — nem a
// batalha antiga terminava, nem ele conseguia entrar num grupo novo.
function sairDaBatalhaPorDesconexao(io, characterId) {
  const battleId = batalhaPorPersonagem.get(characterId);
  if (!battleId) return;
  const batalha = batalhas.get(battleId);
  if (!batalha) {
    batalhaPorPersonagem.delete(characterId);
    return;
  }

  const membro = batalha.membros.get(characterId);
  if (membro) membro.estado.vida_atual = 0;

  // Libera o cadeado de batalha deste personagem JÁ — ele nunca mais vai
  // agir nesta luta (contagem de vivo abaixo nem olha pra ele de novo), e
  // sem isso ficava bloqueado de criar/entrar em outro grupo até a
  // batalha INTEIRA terminar pros outros (que podem demorar — ou nunca
  // terminar, se também sumirem). Bug reportado: sair/desconectar de uma
  // batalha em grupo e continuar recebendo "já está em grupo ou em
  // batalha" ao tentar formar outro grupo, mesmo já aparecendo "sem
  // grupo" (removerDoGrupo, chamado junto no disconnect, já limpava a
  // PARTE do grupo — só a trava de batalha ficava presa).
  batalhaPorPersonagem.delete(characterId);

  const alguemVivo = batalha.ordem.some((id) => batalha.membros.get(id)?.estado.vida_atual > 0);
  if (!alguemVivo) {
    finalizarBatalha(io, battleId, false, "abandono");
    return;
  }

  io.to(batalha.sala).emit(SOCKET_EVENTS.PARTY.TURNO_RESULTADO, {
    battleId,
    origem: "aliado",
    idAtor: characterId,
    nomeAcao: "Desconectou",
    dano: 0,
    esquivou: false,
    vidaAliado: 0,
    rodada: batalha.rodada,
  });

  // Se era a vez de quem acabou de cair, passa o turno adiante — do
  // contrário o grupo ficava esperando pra sempre por uma ação que
  // nunca vem.
  if (batalha.fase === "aliados" && batalha.ordem[batalha.turnoIndex] === characterId) {
    avancarTurnoAliado(io, battleId);
  }
}

// Resync (F5/reconexão) e criação da luta usam o MESMO formato de
// payload — nunca duas formas diferentes de descrever a mesma luta
// (mesmo princípio de montarEstadoBatalha em guildBossSocket.js). Usa
// sempre os valores ATUAIS de `batalha` (vida/mana/turno/rodada no
// momento), nunca os iniciais.


// Motor de Status — formato mínimo que o frontend precisa pra desenhar
// os ícones (StatusEffectIcons.tsx), mesmo shape de statusA/statusB do
// Duelo ao vivo (pvpLiveSocket.js): nunca manda a instância inteira
// (sourceActorId/appliedAtTurn/etc são detalhe de servidor).
function snapshotStatus(lista) {
  return (lista ?? []).map((s) => ({ key: s.key, remainingTurns: s.remainingTurns, stacks: s.stacks }));
}

function snapshotStatusAliados(batalha) {
  const mapa = {};
  for (const id of batalha.ordem) {
    const membro = batalha.membros.get(id);
    if (membro) mapa[id] = snapshotStatus(membro.status);
  }
  return mapa;
}

// Habilidades V2.0 (item 10) — mesmo princípio de snapshotStatus/
// snapshotStatusAliados, só que pros buffs/debuffs TEMPORÁRIOS
// (ConsumableEffect APPLY_COMBAT_BUFF): nunca manda sourceItemId (detalhe
// de servidor, igual status nunca manda sourceActorId/appliedAtTurn).
function snapshotCombatBuffs(lista) {
  return (lista ?? []).map((b) => ({ atributo: b.atributo, valor: b.valor, remainingTurns: b.remainingTurns }));
}

function snapshotCombatBuffsAliados(batalha) {
  const mapa = {};
  for (const id of batalha.ordem) {
    const membro = batalha.membros.get(id);
    if (membro) mapa[id] = snapshotCombatBuffs(membro.combatBuffs);
  }
  return mapa;
}

function proximoAliadoVivoIndex(batalha, apartirDe) {
  for (let i = apartirDe; i < batalha.ordem.length; i++) {
    const membro = batalha.membros.get(batalha.ordem[i]);
    if (membro && membro.estado.vida_atual > 0) return i;
  }
  return -1;
}

function avancarTurnoAliado(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;

  const proximoIndex = proximoAliadoVivoIndex(batalha, batalha.turnoIndex + 1);
  if (proximoIndex !== -1) {
    batalha.turnoIndex = proximoIndex;
    io.to(batalha.sala).emit(SOCKET_EVENTS.PARTY.PROXIMO_TURNO, {
      battleId,
      turnoDe: batalha.ordem[proximoIndex],
      prazoSegundos: partyBattleConfig.PRAZO_TURNO_MS / 1000,
      rodada: batalha.rodada,
    });
    iniciarTimerDeTurnoGrupo(io, battleId);
    return;
  }

  // Todo mundo vivo já agiu nessa rodada — turno do monstro.
  executarTurnoMonstro(io, battleId);
}

async function executarTurnoMonstro(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;

  const vivos = batalha.ordem
    .map((id) => batalha.membros.get(id))
    .filter((m) => m && m.estado.vida_atual > 0);

  if (vivos.length === 0) {
    return finalizarBatalha(io, battleId, false);
  }

  batalha.contadorTurno += 1;

  // IA de Combate PvE & Habilidades de Monstros V1 (§8.2) — decide
  // attack/power ANTES de sortear alvo: monstro sem nenhuma
  // MonsterAbility pré-carregada sempre devolve "attack" (§12.1), então
  // o sorteio aleatório de alvo abaixo continua IDÊNTICO a antes nesse
  // caso (regressão zero). Só quando a IA escolhe uma ability de verdade
  // é que o alvo passa a vir da target_policy dela (§6.3).
  const decisaoIA = monsterCombatAdapter.decidirAcaoGrupo({
    inimigo: batalha.inimigo,
    membrosVivos: vivos,
    cooldowns: batalha.inimigo.cooldowns,
    combatTurn: batalha.contadorTurno,
  });
  const habilidadeEscolhida =
    decisaoIA.type === "power" ? (batalha.inimigo.habilidades ?? []).find((h) => h.id === decisaoIA.abilityId) : null;

  const alvo = habilidadeEscolhida
    ? vivos.find((m) => m.id === decisaoIA.targetIds[0]) ?? vivos[Math.floor(Math.random() * vivos.length)]
    : vivos[Math.floor(Math.random() * vivos.length)];

  if (habilidadeEscolhida) {
    batalha.inimigo.cooldowns = cooldownService.iniciarCooldown(
      batalha.inimigo.cooldowns,
      habilidadeEscolhida.powerId,
      habilidadeEscolhida.cooldownConfigurado,
    );
  }

  // Habilidades V2.0 §7/§9/§11/§26 (Fase 5) — modificadores PASSIVOS do
  // membro que está sendo atacado (defensor aqui), mesmo critério de
  // executarTurnoAliado acima: só resolvido pro lado que é um Character
  // de verdade.
  let modificadoresDefensor = await combatModifierService.resolverModificadoresDoPersonagem(alvo.estado, "PARTY");
  const gatilhosDefensor = await combatModifierService.resolverGatilhosDoPersonagem(alvo.estado, "PARTY");
  const target = powerRuntime.participant(alvo.estado, { key: alvo.id, team: "allies",
    modifiers: modificadoresDefensor, triggers: gatilhosDefensor, status: alvo.status,
    hpMax: alvo.vidaMax, mpMax: alvo.manaMax, cooldowns: alvo.cooldowns });
  const source = powerRuntime.participant(batalha.inimigo, { key: "enemy", team: "enemies",
    hpMax: batalha.inimigo.vida_maxima, status: batalha.inimigo.status });
  const runtime = [source, target, ...[...batalha.membros.values()].filter((m) => m !== alvo).map((m) =>
    powerRuntime.participant(m.estado, { key: m.id, team: "allies", hpMax: m.vidaMax,
      mpMax: m.manaMax, status: m.status, cooldowns: m.cooldowns }))];
  powerRuntime.start(target, source, runtime);
  alvo.status = target.status;
  modificadoresDefensor = powerRuntime.effective(target);
  const vidaAntesDaPower = alvo.estado.vida_atual;

  let nomeAcao;
  let dano;
  let esquivou = false;
  let critico = false;
  let bloqueado = false;
  let logStatus;

  if (habilidadeEscolhida) {
    // IA de Combate PvE & Habilidades de Monstros V1 — mesmo roll de
    // bloqueio/acerto que resolverTurnoComStatus faz internamente pro
    // ataque básico (statusEffectService.resolverAcoesBloqueadasDoTurno
    // + resolverResultadoDeAcerto), aplicado aqui explicitamente porque a
    // execução da Power é delegada pro adapter, não pro duelEngine.
    const controle = statusEffectService.resolverAcoesBloqueadasDoTurno(batalha.inimigo.status, batalha.contadorTurno);
    batalha.inimigo.status = controle.lista;
    if (controle.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK)) {
      nomeAcao = "Ação bloqueada";
      dano = 0;
      bloqueado = true;
      logStatus = [`${batalha.inimigo.nome} está ${definicaoDoStatus(controle.motivoBloqueioTotal).nomeUi} e não conseguiu agir!`];
    } else {
      const resultadoAcerto = resolverResultadoDeAcerto({
        atacante: batalha.inimigo,
        defensor: alvo.estado,
        blindPotency: batalha.inimigo.status.find((s) => s.key === "BLIND")?.potency ?? 0,
        modificadoresDefensor,
      });
      if (!resultadoAcerto.hit) {
        nomeAcao = habilidadeEscolhida.nome;
        dano = 0;
        esquivou = true;
        logStatus = [
          resultadoAcerto.reason === "BLIND_MISS"
            ? `${batalha.inimigo.nome}, cego, errou o ataque!`
            : `${alvo.nome} esquivou do ataque de ${batalha.inimigo.nome}!`,
        ];
        if (resultadoAcerto.reason === "DODGE") powerRuntime.emit("ON_DODGE", target, source, runtime);
      } else {
        const log = [];
        const resultadoPower = monsterCombatAdapter.executarPoderEmGrupo({
          habilidade: habilidadeEscolhida,
          inimigo: batalha.inimigo,
          alvoEstado: alvo.estado,
          alvoStatus: alvo.status,
          alvoBuffs: alvo.combatBuffs,
          modificadoresDefensor,
          combatTurn: batalha.contadorTurno,
          log,
        });
        nomeAcao = habilidadeEscolhida.nome;
        dano = resultadoPower.dano;
        critico = resultadoPower.criticoInimigo;
        batalha.inimigo.status = resultadoPower.statusAtacante;
        alvo.status = resultadoPower.statusDefensor;
        alvo.combatBuffs = resultadoPower.buffsDefensor ?? alvo.combatBuffs;
        const absorbed = combatBuffService.absorverDano(target.shield,
          Math.max(0, vidaAntesDaPower - alvo.estado.vida_atual));
        target.shield = absorbed.escudo;
        alvo.estado.vida_atual = Math.max(0, vidaAntesDaPower - absorbed.danoResidual);
        target.status = alvo.status;
        if (alvo.estado.vida_atual < vidaAntesDaPower) powerRuntime.emit("ON_DAMAGE_TAKEN", target, source, runtime);
        alvo.status = target.status;
        powerRuntime.end(source, target, runtime);
        logStatus = log;
      }
    }
  } else {
    // Mesmo motor de executarTurnoAliado, agora do lado do monstro —
    // `efeitosDeStatusAtacante` é o catálogo configurado no admin (ideia
    // #3 da fila de melhorias), rolado igual ao proc de arma do jogador:
    // só dispara em ataque básico que de fato causa dano, nunca na hora
    // de causar (isso aqui só REGISTRA a instância) — o dano do status em
    // si só sai depois, no tick de fim de turno de quem ESTÁ com ele.
    const resultado = await resolverTurnoComStatus({
      atacante: batalha.inimigo,
      defensor: alvo.estado,
      acao: { tipo: "attack" },
      vidaMaxAtacante: batalha.inimigo.vida_maxima,
      statusAtacante: batalha.inimigo.status,
      statusDefensor: alvo.status,
      buffsAtacante: batalha.inimigo.combatBuffs,
      buffsDefensor: alvo.combatBuffs,
      turno: batalha.contadorTurno,
      casterActorId: "inimigo",
      efeitosDeStatusAtacante: batalha.inimigo.efeitosDeStatus,
      nomeAtacante: batalha.inimigo.nome,
      nomeDefensor: alvo.nome,
      modificadoresDefensor,
      gatilhosDefensor,
      runtime,
      contexto: "PARTY",
      vidaMaxDefensor: alvo.vidaMax,
      manaMaxDefensor: alvo.manaMax,
    });
    nomeAcao = resultado.nomeAcao;
    dano = resultado.dano;
    esquivou = resultado.esquivou;
    critico = resultado.critico;
    bloqueado = resultado.bloqueado;
    logStatus = resultado.log;
    batalha.inimigo.status = resultado.statusAtacante;
    alvo.status = resultado.statusDefensor;
    batalha.inimigo.combatBuffs = resultado.buffsAtacante ?? batalha.inimigo.combatBuffs;
  }

  for (const member of batalha.membros.values()) {
    if (member === alvo) continue;
    const participant = runtime.find((p) => p.actor === member.estado);
    if (participant) member.status = participant.status;
  }

  // Fim do turno do monstro (§8.1 equivalente de Party) — cooldown recém
  // iniciado neste MESMO turno não decrementa ainda (mesma semântica de
  // Solo/personagem: só os turnos SEGUINTES contam).
  batalha.inimigo.cooldowns = cooldownService.decrementarCooldowns(
    batalha.inimigo.cooldowns,
    habilidadeEscolhida ? new Set([cooldownService.chaveDoPoder(habilidadeEscolhida.powerId)]) : undefined,
  );

  io.to(batalha.sala).emit(SOCKET_EVENTS.PARTY.TURNO_RESULTADO, {
    battleId,
    origem: "monstro",
    idAlvo: alvo.id,
    nomeAcao,
    dano,
    esquivou,
    critico: Boolean(critico),
    bloqueado: Boolean(bloqueado),
    logStatus,
    vidaAliado: alvo.estado.vida_atual,
    rodada: batalha.rodada,
    statusInimigo: snapshotStatus(batalha.inimigo.status),
    statusAliados: snapshotStatusAliados(batalha),
    combatBuffsInimigo: snapshotCombatBuffs(batalha.inimigo.combatBuffs),
    combatBuffsAliados: snapshotCombatBuffsAliados(batalha),
  });

  const alguemVivo = batalha.ordem.some((id) => batalha.membros.get(id)?.estado.vida_atual > 0);
  if (!alguemVivo) {
    return finalizarBatalha(io, battleId, false);
  }

  batalha.rodada += 1;
  if (batalha.rodada > partyBattleConfig.MAX_RODADAS) {
    return finalizarBatalha(io, battleId, false, "tempo_esgotado");
  }

  const primeiroVivoIndex = proximoAliadoVivoIndex(batalha, 0);
  batalha.turnoIndex = primeiroVivoIndex;
  batalha.fase = "aliados";

  io.to(batalha.sala).emit(SOCKET_EVENTS.PARTY.PROXIMO_TURNO, {
    battleId,
    turnoDe: batalha.ordem[primeiroVivoIndex],
    prazoSegundos: partyBattleConfig.PRAZO_TURNO_MS / 1000,
    rodada: batalha.rodada,
  });
  iniciarTimerDeTurnoGrupo(io, battleId);
}

async function finalizarBatalha(io, battleId, vitoria, motivo = vitoria ? "combate" : "derrota") {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);
  batalhas.delete(battleId);
  for (const id of batalha.ordem) {
    batalhaPorPersonagem.delete(id);
  }

  const recompensas = {};
  const drops = {};

  // Persiste vida/mana de TODO MUNDO no grupo, vitória ou derrota — sem
  // isso, o "estado" em memória da batalha (inclusive um vida_atual=0 de
  // quem morreu) nunca voltava pro personagem de verdade no banco, e ele
  // seguia pra próxima aventura solo com a vida antiga intacta, furando
  // o bloqueio normal de "derrotado, precisa se recuperar" (bug
  // reportado: morrer numa party e voltar com vida cheia na aventura
  // solo). Recompensa (XP/ouro/drop) continua só na vitória, cheia por
  // membro (não dividida pelo tamanho do grupo, de propósito: o motivo
  // de ir em grupo é enfrentar algo mais forte que valha a pena).
  for (const id of batalha.ordem) {
    const membro = batalha.membros.get(id);
    try {
      await sequelize.transaction(async (transaction) => {
        const character = await Character.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!character) return;

        persistirEstadoFinalDoMembro(character, membro);

        if (vitoria) {
          // Reformulação V2 dos Monstros (§9.3) — bug corrigido: a Party
          // tinha sua PRÓPRIA fórmula de XP/ouro por nível
          // (max(10,nivel*8)/10+nivel*2), divergente da recompensa fixa
          // e autoral da Aventura solo (xp_recompensa/ouro_recompensa).
          // Agora usa a MESMA base fixa do monstro, cheia por membro.
          //
          // Pedido do jogador: multiplicadorRecompensa (1 = sem
          // penalidade) calculado no início da luta (party:iniciar),
          // aplicado aqui pra TODO MUNDO do grupo igual, inclusive quem
          // está carregando: o alvo é desincentivar o farm de boost em
          // si, não só "punir" o personagem fraco que está sendo ajudado.
          const multiplicador = batalha.penalidadeDiferencaNivel?.multiplicador ?? 1;
          const crisisReward=await require("../services/worldCrisisEffectService").apply((batalha.inimigo.xp_recompensa??0)*multiplicador,(batalha.inimigo.ouro_recompensa??0)*multiplicador,"ADVENTURE_PARTY",transaction);
          const xpConcedida = crisisReward.xp;
          const resultadoXp = await adicionarExperiencia(id, xpConcedida, { transaction, personagem: character });

          const ouro = crisisReward.gold;
          concederOuro(character, ouro);

          const drop = await rolarDropDeVitoria(character, batalha.inimigo, transaction,"ADVENTURE_PARTY");
          if (drop) drops[id] = drop;

          // Guilda dos Aventureiros (§23/§45) — bug reportado: vitória em
          // grupo nunca alimentava contrato de Rank ativo nenhum (só
          // existia no encontro solo, combatController.js). Mesmo evento
          // real, mesmo par de chamadas, dentro da MESMA transaction por
          // membro — cada aventureiro do grupo progride no SEU próprio
          // contrato, igual uma vitória solo contaria.
          await registrarProgressoContrato(
            character,
            "MatarInimigos",
            1,
            { id_monstro: batalha.inimigo.id_monstro, id_area: batalha.zona.id },
            transaction,
          );
          await registrarProgressoContrato(character, "GanharOuro", ouro, {}, transaction);

          recompensas[id] = {
            crisis_penalty:crisisReward.crisis_penalty,
            experiencia: xpConcedida,
            dinheiro: ouro,
            nivel: resultadoXp.nivel,
            pontos_distribuir: resultadoXp.pontos_distribuir,
          };
        }

        await character.save({ transaction });
      });
    } catch (error) {
      console.error(`Erro ao finalizar batalha de grupo pro personagem ${id}:`, error);
    }
  }

  io.to(batalha.sala).emit(SOCKET_EVENTS.PARTY.BATALHA_FIM, {
    battleId,
    vitoria,
    motivo,
    recompensas,
    drops,
    penalidadeDiferencaNivel: batalha.penalidadeDiferencaNivel?.aplicada
      ? { multiplicador: batalha.penalidadeDiferencaNivel.multiplicador, diferencaNivel: batalha.penalidadeDiferencaNivel.diferenca }
      : null,
  });

  for (const socketId of io.sockets.adapter.rooms.get(batalha.sala) || []) {
    io.sockets.sockets.get(socketId)?.leave(batalha.sala);
  }

  // O grupo sobrevive à aventura — só o anfitrião desfazendo (saindo,
  // ver removerDoGrupo) encerra o grupo de verdade. Terminar uma run
  // (vitória, derrota ou abandono por desconexão) só devolve todo mundo
  // pro lobby, prontos pra encarar outra sem precisar se convidar de
  // novo. Se o próprio anfitrião já tiver saído/desfeito o grupo durante
  // a batalha, `grupo` não existe mais aqui — nada a restaurar.
  const grupo = grupos.get(batalha.partyId);
  if (grupo) {
    grupo.emBatalha = false;
    for (const membro of grupo.membros.values()) {
      membro.pronto = false;
    }
    emitirGrupoAtualizado(io, grupo);
  }
}

module.exports.estaEmBatalha = id => batalhaPorPersonagem.has(String(id));
