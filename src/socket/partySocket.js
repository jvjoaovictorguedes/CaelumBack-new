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
// De propósito SEM "identificar" próprio: reaproveita socket.characterId
// já setado pelo "identificar" do pvpLiveSocket — este módulo só atende
// conexões que já passaram por lá (o PvpSocketProvider do frontend é
// global, montado uma vez pra todo o dashboard, então characterId já
// está disponível antes de qualquer tela de Aventura usar isto). Ver o
// comentário equivalente em guildSocket.js sobre o motivo de NÃO usar
// "identificar" genérico quando o socket é outro — aqui não se aplica
// porque é a MESMA conexão, mas vale registrar o porquê.

const Character = require("../models/Character");
const AdventureZone = require("../models/AdventureZone");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonster = require("../models/AdventureMonster");
const { sequelize } = require("../config/database");
const { aplicarAcao } = require("../services/duelEngine");
const { adicionarExperiencia } = require("../services/experienceService");
const { concederOuro } = require("../services/goldService");
const { rolarDropDeVitoria } = require("../services/dropService");
const { sortearMonstroDaZona } = require("../services/adventureRollService");
const { persistirEstadoFinalDoMembro } = require("../services/partyBattleService");
const { custoManaEfetivo } = require("../services/combatFormulas");
const {
  online,
  chaveOnline,
  carregarLutador,
  poderesPublicos,
  registrarAoIdentificar,
} = require("./pvpLiveSocket");

const TAMANHO_MAXIMO_GRUPO = 4;
const TAMANHO_MINIMO_GRUPO = 2;
const PRAZO_CONVITE_MS = 20000;
const PRAZO_TURNO_MS = 20000;
const MAX_RODADAS = 40;

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
  io.to(`party:${grupo.id}`).emit("party:grupo-atualizado", {
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
    io.to(`party:${partyId}`).emit("party:grupo-desfeito", {
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

    const restanteMs = pendente.criadoEm + PRAZO_CONVITE_MS - Date.now();
    if (restanteMs <= 0) return;

    const grupo = grupos.get(pendente.partyId);
    const convidante = grupo?.membros.get(pendente.idConvidante);
    if (!grupo || !convidante) return;

    socket.emit("party:convite-recebido", {
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
    // "pvp:listar-online" (pvpLiveSocket.js), só que também resolve nome.
    socket.on("party:listar-online", async (_payload, callback) => {
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
    socket.on("party:criar", async () => {
      const characterId = socket.characterId;
      if (!characterId) {
        return socket.emit("party:erro", { mensagem: "Identifique seu personagem antes de criar um grupo." });
      }
      if (grupoPorPersonagem.has(characterId) || batalhaPorPersonagem.has(characterId)) {
        return socket.emit("party:erro", { mensagem: "Você já está em outro grupo ou em batalha." });
      }

      const anfitriao = await Character.findByPk(characterId, { attributes: ["id", "nome"] });
      if (!anfitriao) {
        return socket.emit("party:erro", { mensagem: "Personagem não encontrado." });
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

    socket.on("party:convidar", async ({ idConvidado } = {}) => {
      const idConvidante = socket.characterId;
      if (!idConvidante) {
        return socket.emit("party:erro", { mensagem: "Identifique seu personagem antes de convidar." });
      }
      const chaveConvidado = chaveOnline(idConvidado);
      if (!idConvidado || chaveConvidado === idConvidante) {
        return socket.emit("party:erro", { mensagem: "Escolha um amigo válido pra convidar." });
      }
      if (!online.has(chaveConvidado)) {
        return socket.emit("party:erro", { mensagem: "Esse jogador não está online agora." });
      }
      if (grupoPorPersonagem.has(chaveConvidado) || batalhaPorPersonagem.has(chaveConvidado)) {
        return socket.emit("party:erro", { mensagem: "Esse jogador já está em outro grupo ou em batalha." });
      }
      if (batalhaPorPersonagem.has(idConvidante)) {
        return socket.emit("party:erro", { mensagem: "Você já está numa batalha em grupo." });
      }
      if (convitesPendentes.has(chaveConvidado)) {
        return socket.emit("party:erro", { mensagem: "Esse jogador já tem um convite pendente." });
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
        return socket.emit("party:erro", { mensagem: "Só o anfitrião do grupo pode chamar mais gente." });
      }

      if (grupo.emBatalha) {
        return socket.emit("party:erro", { mensagem: "Não dá pra chamar mais gente com o grupo em batalha." });
      }

      if (grupo.membros.size >= TAMANHO_MAXIMO_GRUPO) {
        return socket.emit("party:erro", { mensagem: `O grupo já está cheio (máximo ${TAMANHO_MAXIMO_GRUPO}).` });
      }

      // Anfitrião entra no próprio grupo já na primeira chamada (antes
      // dele só existir "na cabeça" do convite).
      if (!grupo.membros.has(idConvidante)) {
        const anfitriao = await Character.findByPk(idConvidante, { attributes: ["id", "nome"] });
        if (!anfitriao) {
          grupos.delete(grupo.id);
          return socket.emit("party:erro", { mensagem: "Personagem não encontrado." });
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
        socket.emit("party:convite-expirado", { idConvidado: chaveConvidado });
        io.to(socketIdConvidado).emit("party:convite-cancelado", { idConvidante });
      }, PRAZO_CONVITE_MS);

      convitesPendentes.set(chaveConvidado, {
        idConvidante,
        partyId: grupo.id,
        socketIdConvidante: socket.id,
        timeoutHandle,
        criadoEm: Date.now(),
      });

      socket.emit("party:convite-enviado", { idConvidado: chaveConvidado, prazoSegundos: PRAZO_CONVITE_MS / 1000 });
      io.to(socketIdConvidado).emit("party:convite-recebido", {
        idConvidante,
        nomeConvidante: convidante.nome,
        partyId: grupo.id,
        membros: membrosPublicos(grupo),
        prazoSegundos: PRAZO_CONVITE_MS / 1000,
      });
    });

    socket.on("party:responder-convite", async ({ aceitar } = {}) => {
      const idConvidado = socket.characterId;
      if (!idConvidado) return;
      const pendente = convitesPendentes.get(idConvidado);
      if (!pendente) {
        return socket.emit("party:erro", { mensagem: "Esse convite não existe mais." });
      }
      limparConvitePendente(idConvidado);

      if (!aceitar) {
        io.to(pendente.socketIdConvidante).emit("party:convite-recusado", { idConvidado });
        return;
      }

      const grupo = grupos.get(pendente.partyId);
      if (!grupo) {
        return socket.emit("party:erro", { mensagem: "Esse grupo não existe mais." });
      }
      if (grupo.membros.size >= TAMANHO_MAXIMO_GRUPO) {
        return socket.emit("party:erro", { mensagem: "O grupo ficou cheio antes de você aceitar." });
      }
      if (grupoPorPersonagem.has(idConvidado) || batalhaPorPersonagem.has(idConvidado)) {
        return socket.emit("party:erro", { mensagem: "Você já está em outro grupo ou em batalha." });
      }

      const personagem = await Character.findByPk(idConvidado, { attributes: ["id", "nome"] });
      if (!personagem) {
        return socket.emit("party:erro", { mensagem: "Personagem não encontrado." });
      }

      grupo.membros.set(idConvidado, { id: personagem.id, nome: personagem.nome, classe: null, pronto: false });
      grupo.ordem.push(idConvidado);
      grupoPorPersonagem.set(idConvidado, grupo.id);
      socket.join(`party:${grupo.id}`);

      emitirGrupoAtualizado(io, grupo);
    });

    socket.on("party:pronto", ({ pronto } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const partyId = grupoPorPersonagem.get(characterId);
      if (!partyId) return socket.emit("party:erro", { mensagem: "Você não está em nenhum grupo." });
      const grupo = grupos.get(partyId);
      if (!grupo) return;
      const membro = grupo.membros.get(characterId);
      if (!membro) return;
      membro.pronto = Boolean(pronto);
      emitirGrupoAtualizado(io, grupo);
    });

    socket.on("party:sair", () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      removerDoGrupo(io, characterId);
    });

    // Remover alguém do grupo (só o anfitrião) — igual convidar mais
    // gente, funciona a qualquer momento antes da batalha começar, não
    // só na tela de montar o grupo.
    socket.on("party:expulsar", ({ idAlvo } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const partyId = grupoPorPersonagem.get(characterId);
      if (!partyId) return socket.emit("party:erro", { mensagem: "Você não está em nenhum grupo." });
      const grupo = grupos.get(partyId);
      if (!grupo) return;
      if (grupo.hostId !== characterId) {
        return socket.emit("party:erro", { mensagem: "Só o anfitrião pode remover alguém do grupo." });
      }
      if (grupo.emBatalha) {
        return socket.emit("party:erro", { mensagem: "Não dá pra remover alguém com o grupo em batalha." });
      }
      const chaveAlvo = chaveOnline(idAlvo);
      if (chaveAlvo === characterId) {
        return socket.emit("party:erro", { mensagem: 'Use "Sair do grupo" pra sair você mesmo.' });
      }
      if (!grupo.membros.has(chaveAlvo)) {
        return socket.emit("party:erro", { mensagem: "Esse jogador não está mais no grupo." });
      }

      grupo.membros.delete(chaveAlvo);
      grupo.ordem = grupo.ordem.filter((id) => id !== chaveAlvo);
      grupoPorPersonagem.delete(chaveAlvo);

      const socketIdAlvo = online.get(chaveAlvo);
      const socketDoAlvo = socketIdAlvo ? io.sockets.sockets.get(socketIdAlvo) : null;
      socketDoAlvo?.leave(`party:${partyId}`);
      socketDoAlvo?.emit("party:expulso", { partyId });

      emitirGrupoAtualizado(io, grupo);
    });

    socket.on("party:iniciar", async ({ idZona } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const partyId = grupoPorPersonagem.get(characterId);
      if (!partyId) return socket.emit("party:erro", { mensagem: "Você não está em nenhum grupo." });
      const grupo = grupos.get(partyId);
      if (!grupo) return;
      if (grupo.hostId !== characterId) {
        return socket.emit("party:erro", { mensagem: "Só o anfitrião pode iniciar a aventura." });
      }
      if (grupo.emBatalha) {
        return socket.emit("party:erro", { mensagem: "O grupo já está em batalha." });
      }
      if (grupo.membros.size < TAMANHO_MINIMO_GRUPO) {
        return socket.emit("party:erro", { mensagem: `Precisa de pelo menos ${TAMANHO_MINIMO_GRUPO} aventureiros pra formar um grupo.` });
      }
      const naoProntos = grupo.ordem.filter((id) => !grupo.membros.get(id)?.pronto);
      if (naoProntos.length > 0) {
        return socket.emit("party:erro", { mensagem: "Ainda tem gente que não marcou 'pronto'." });
      }

      try {
        const zona = await AdventureZone.findByPk(idZona);
        if (!zona) {
          return socket.emit("party:erro", { mensagem: "Área de caça inválida." });
        }
        const monstrosDaZona = await AdventureZoneMonster.findAll({
          where: { id_area: zona.id, ativo: true },
          include: [{ model: AdventureMonster, as: "monstro" }],
        });
        if (monstrosDaZona.length === 0) {
          return socket.emit("party:erro", { mensagem: "Área de Caça sem monstros configurados." });
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
          return socket.emit("party:erro", { mensagem: "Não foi possível carregar todos os personagens do grupo." });
        }
        const derrotados = membros.filter((m) => m.estado.vida_atual <= 0);
        if (derrotados.length > 0) {
          return socket.emit("party:erro", {
            mensagem: `${derrotados.map((m) => m.nome).join(", ")} está derrotado e precisa se recuperar antes de entrar em batalha.`,
          });
        }

        // Reformulação V2 dos Monstros (§4.3) — nivel_jogador_minimo só
        // decide ELEGIBILIDADE de aparição; usa o nível do membro MAIS
        // BAIXO do grupo, então um vínculo só entra no pool se TODO
        // mundo já pode enfrentá-lo, não só a média.
        const menorNivelDoGrupo = Math.min(...membros.map((m) => m.estado.nivel || 1));
        const monstrosElegiveis = monstrosDaZona.filter(
          (zm) => menorNivelDoGrupo >= (zm.nivel_jogador_minimo ?? 1),
        );
        if (monstrosElegiveis.length === 0) {
          return socket.emit("party:erro", {
            mensagem: "Nenhuma criatura dessa Área de Caça está disponível pro nível do grupo ainda.",
          });
        }

        const escolhido = sortearMonstroDaZona(monstrosElegiveis);
        const monstro = escolhido.monstro;

        // Reformulação V2 dos Monstros (§9) — Party usa os MESMOS stats
        // fixos do monstro, sem sorteio de nível nem RNG de variação.
        // O único modificador CONTEXTUAL (nunca persistido em
        // AdventureMonster) é a escala pelo TAMANHO do grupo: N aliados
        // batem nele por rodada, então precisa aguentar os N golpes —
        // esse bônus extra, por cabeça além do mínimo de
        // TAMANHO_MINIMO_GRUPO, empilha em cima disso um pouco mais de
        // vida e dano (moderado — o resto do design já favorece ir em
        // grupo: XP/ouro cheios pra todo mundo, não divididos).
        const tamanhoGrupo = Math.max(1, membros.length);
        const aventureirosExtras = Math.max(0, grupo.ordem.length - TAMANHO_MINIMO_GRUPO);
        const fatorDificuldadeGrupo = {
          vida: 1 + aventureirosExtras * 0.12,
          dano: 1 + aventureirosExtras * 0.08,
        };

        const vidaMaxima = Math.max(
          20,
          Math.round(monstro.vida_maxima * tamanhoGrupo * fatorDificuldadeGrupo.vida),
        );
        const danoMin = Math.max(0, Math.round(monstro.dano_min * fatorDificuldadeGrupo.dano));
        const danoMax = Math.max(danoMin, Math.round(monstro.dano_max * fatorDificuldadeGrupo.dano));

        const inimigo = {
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
          xp_recompensa: monstro.xp_recompensa,
          ouro_recompensa: monstro.ouro_recompensa,
        };
        // Expansão Aventura Beta §29/§39 — Party usa o mesmo sprite_key
        // do catálogo, nunca uma resolução própria por nome. imagem_url
        // serve de sprite de combate quando ainda não existe sprite_key
        // dedicado (monstro sem arte animada ainda).
        inimigo.sprite_key = monstro.sprite_key ?? null;
        inimigo.imagem_url = monstro.imagem_url ?? null;

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

        io.to(sala).emit("party:batalha-iniciada", {
          battleId,
          zona: batalha.zona,
          inimigo: {
            nome: inimigo.nome,
            nivel: inimigo.nivel,
            vida_atual: inimigo.vida_atual,
            vida_maxima: inimigo.vida_maxima,
            sprite_key: inimigo.sprite_key,
            imagem_url: inimigo.imagem_url,
          },
          membros: membros.map((m) => ({
            id: m.id,
            nome: m.nome,
            genero: m.genero,
            classe: m.classe,
            vidaMax: m.vidaMax,
            manaMax: m.manaMax,
            vida: m.estado.vida_atual,
            mana: m.estado.mana_atual,
            poderes: poderesPublicos(m.poderes),
            consumiveis: m.consumiveis,
          })),
          ordem: batalha.ordem,
          turnoDe: batalha.ordem[0],
          prazoSegundos: PRAZO_TURNO_MS / 1000,
        });

        iniciarTimerDeTurnoGrupo(io, battleId);
      } catch (error) {
        console.error("Erro ao iniciar batalha em grupo:", error);
        socket.emit("party:erro", { mensagem: "Não foi possível iniciar a aventura em grupo." });
      }
    });

    socket.on("party:acao", async ({ tipo, idPoder, idItem } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const battleId = batalhaPorPersonagem.get(characterId);
      if (!battleId) return socket.emit("party:erro", { mensagem: "Você não está em nenhuma batalha." });
      const batalha = batalhas.get(battleId);
      if (!batalha) return;
      if (batalha.processandoAcao) {
        return socket.emit("party:erro", { mensagem: "Aguarde, a última ação ainda está sendo processada." });
      }
      if (batalha.fase !== "aliados" || batalha.ordem[batalha.turnoIndex] !== characterId) {
        return socket.emit("party:erro", { mensagem: "Ainda não é o seu turno." });
      }

      const atacante = batalha.membros.get(characterId);
      if (!atacante || atacante.estado.vida_atual <= 0) {
        return socket.emit("party:erro", { mensagem: "Você não pode agir derrotado." });
      }

      let acao = { tipo: "attack" };
      if (tipo === "power") {
        const power = atacante.poderes.find((p) => p.id === Number(idPoder));
        if (!power) return socket.emit("party:erro", { mensagem: "Poder inválido." });
        if (power.tipo_poder !== "Ativo") {
          return socket.emit("party:erro", { mensagem: "Este poder não pode ser usado manualmente em combate." });
        }
        if (custoManaEfetivo(power, power.nivel_habilidade ?? 1) > atacante.estado.mana_atual) {
          return socket.emit("party:erro", { mensagem: "Mana insuficiente para esse poder." });
        }
        acao = { tipo: "power", power };
      } else if (tipo === "item") {
        batalha.processandoAcao = true;
        try {
          const consumivel = atacante.consumiveis.find((c) => c.id_item === Number(idItem));
          if (!consumivel || consumivel.quantidade < 1) {
            return socket.emit("party:erro", { mensagem: "Você não possui esse item no inventário." });
          }
          acao = {
            tipo: "item",
            item: { nome: consumivel.nome },
            efeito: { efeito_vida: consumivel.efeito_vida, efeito_mana: consumivel.efeito_mana },
          };
        } finally {
          batalha.processandoAcao = false;
        }
      }

      await executarTurnoAliado(io, battleId, characterId, acao);
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
  }, PRAZO_TURNO_MS);
}

async function executarTurnoAliado(io, battleId, characterId, acao, foiAutomatico = false) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);

  const atacante = batalha.membros.get(characterId);
  const { nomeAcao, dano, cura, manaCurada, esquivou } = aplicarAcao({
    atacante: atacante.estado,
    defensor: batalha.inimigo,
    acao,
    vidaMaxAtacante: atacante.vidaMax,
    manaMaxAtacante: atacante.manaMax,
  });

  io.to(batalha.sala).emit("party:turno-resultado", {
    battleId,
    origem: "aliado",
    idAtor: characterId,
    nomeAcao: foiAutomatico ? `${nomeAcao} (tempo esgotado)` : nomeAcao,
    dano,
    cura,
    manaCurada,
    esquivou,
    vidaInimigo: batalha.inimigo.vida_atual,
    vidaAliado: atacante.estado.vida_atual,
    manaAliado: atacante.estado.mana_atual,
    rodada: batalha.rodada,
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

  const alguemVivo = batalha.ordem.some((id) => batalha.membros.get(id)?.estado.vida_atual > 0);
  if (!alguemVivo) {
    finalizarBatalha(io, battleId, false, "abandono");
    return;
  }

  io.to(batalha.sala).emit("party:turno-resultado", {
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
    io.to(batalha.sala).emit("party:proximo-turno", {
      battleId,
      turnoDe: batalha.ordem[proximoIndex],
      prazoSegundos: PRAZO_TURNO_MS / 1000,
      rodada: batalha.rodada,
    });
    iniciarTimerDeTurnoGrupo(io, battleId);
    return;
  }

  // Todo mundo vivo já agiu nessa rodada — turno do monstro.
  executarTurnoMonstro(io, battleId);
}

function executarTurnoMonstro(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;

  const vivos = batalha.ordem
    .map((id) => batalha.membros.get(id))
    .filter((m) => m && m.estado.vida_atual > 0);

  if (vivos.length === 0) {
    return finalizarBatalha(io, battleId, false);
  }

  const alvo = vivos[Math.floor(Math.random() * vivos.length)];
  const { nomeAcao, dano, esquivou } = aplicarAcao({
    atacante: batalha.inimigo,
    defensor: alvo.estado,
    acao: { tipo: "attack" },
    vidaMaxAtacante: batalha.inimigo.vida_maxima,
  });

  io.to(batalha.sala).emit("party:turno-resultado", {
    battleId,
    origem: "monstro",
    idAlvo: alvo.id,
    nomeAcao,
    dano,
    esquivou,
    vidaAliado: alvo.estado.vida_atual,
    rodada: batalha.rodada,
  });

  const alguemVivo = batalha.ordem.some((id) => batalha.membros.get(id)?.estado.vida_atual > 0);
  if (!alguemVivo) {
    return finalizarBatalha(io, battleId, false);
  }

  batalha.rodada += 1;
  if (batalha.rodada > MAX_RODADAS) {
    return finalizarBatalha(io, battleId, false, "tempo_esgotado");
  }

  const primeiroVivoIndex = proximoAliadoVivoIndex(batalha, 0);
  batalha.turnoIndex = primeiroVivoIndex;
  batalha.fase = "aliados";

  io.to(batalha.sala).emit("party:proximo-turno", {
    battleId,
    turnoDe: batalha.ordem[primeiroVivoIndex],
    prazoSegundos: PRAZO_TURNO_MS / 1000,
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
          const xpConcedida = batalha.inimigo.xp_recompensa ?? 0;
          const resultadoXp = await adicionarExperiencia(id, xpConcedida, { transaction, personagem: character });

          const ouro = batalha.inimigo.ouro_recompensa ?? 0;
          concederOuro(character, ouro);

          const drop = await rolarDropDeVitoria(character, batalha.inimigo, transaction);
          if (drop) drops[id] = drop;

          recompensas[id] = {
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

  io.to(batalha.sala).emit("party:batalha-fim", {
    battleId,
    vitoria,
    motivo,
    recompensas,
    drops,
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
