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
const { sortearMonstroDaZona, sortearNivelMonstro } = require("../services/adventureRollService");
const { gerarInimigoDeGrupo } = require("../controllers/combatController");
const { custoManaEfetivo, danoBasicoEsperado } = require("../services/combatFormulas");
const {
  online,
  chaveOnline,
  carregarLutador,
  poderesPublicos,
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

        const membros = await Promise.all(grupo.ordem.map((id) => carregarLutador(id)));
        if (membros.some((m) => !m)) {
          return socket.emit("party:erro", { mensagem: "Não foi possível carregar todos os personagens do grupo." });
        }

        const vidaTotalGrupo = membros.reduce((soma, m) => soma + m.vidaMax, 0);
        const vidaMediaAliado = vidaTotalGrupo / membros.length;
        const ataqueTotalGrupo = membros.reduce(
          (soma, m) => soma + Math.max(1, danoBasicoEsperado(m.estado)),
          0,
        );
        const nivelMedio = Math.round(membros.reduce((s, m) => s + (m.estado.nivel || 1), 0) / membros.length);
        const agilidadeMedia = membros.reduce((s, m) => s + (m.estado.agilidade || 1), 0) / membros.length;
        const velocidadeMedia = membros.reduce((s, m) => s + (m.estado.velocidade || 1), 0) / membros.length;

        const escolhido = sortearMonstroDaZona(monstrosDaZona);
        const nivelSorteado = sortearNivelMonstro(escolhido, zona);

        // A soma de atributos do grupo (vidaTotalGrupo/ataqueTotalGrupo)
        // já deixa o monstro mais "gordo" com mais gente, mas o monstro
        // só ataca UM aliado por rodada — então, sem mais nada, quanto
        // maior o grupo, mais diluído (mais fácil por pessoa) fica o
        // risco. Esse bônus extra, por cabeça além do mínimo de
        // TAMANHO_MINIMO_GRUPO, compensa isso com um pouco mais de vida e
        // dano do inimigo (moderado — o resto do design já favorece ir
        // em grupo: XP/ouro cheios pra todo mundo, não divididos).
        const aventureirosExtras = Math.max(0, grupo.ordem.length - TAMANHO_MINIMO_GRUPO);
        const fatorDificuldadeGrupo = {
          vida: 1 + aventureirosExtras * 0.12,
          dano: 1 + aventureirosExtras * 0.08,
        };
        const multiplicadores = {
          vida: escolhido.monstro.multiplicador_vida * fatorDificuldadeGrupo.vida,
          dano: escolhido.monstro.multiplicador_dano * fatorDificuldadeGrupo.dano,
          agilidade: escolhido.monstro.multiplicador_agilidade,
          velocidade: escolhido.monstro.multiplicador_velocidade,
        };

        const inimigo = gerarInimigoDeGrupo(
          { vidaTotalGrupo, ataqueTotalGrupo, vidaMediaAliado, nivelMedio, agilidadeMedia, velocidadeMedia },
          escolhido.monstro.nome,
          { nivelForcado: nivelSorteado, multiplicadores },
        );

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
          inimigo: { nome: inimigo.nome, nivel: inimigo.nivel, vida_atual: inimigo.vida_atual, vida_maxima: inimigo.vida_maxima },
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
      // mesmo characterId já assumiu `online` antes desse handler rodar).
      if (online.get(characterId) === socket.id) return;
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

  if (vitoria) {
    // Recompensa por membro — cada aventureiro leva XP/ouro cheios (não
    // dividido pelo tamanho do grupo, de propósito: o motivo de ir em
    // grupo é enfrentar algo mais forte que valha a pena, não uma fatia
    // menor da mesma recompensa solo).
    for (const id of batalha.ordem) {
      try {
        await sequelize.transaction(async (transaction) => {
          const character = await Character.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!character) return;

          const xpConcedida = Math.max(10, Math.round(batalha.inimigo.nivel * 8));
          const resultadoXp = await adicionarExperiencia(id, xpConcedida, { transaction, personagem: character });

          const ouro = 10 + batalha.inimigo.nivel * 2;
          concederOuro(character, ouro);

          const drop = await rolarDropDeVitoria(character, batalha.inimigo, transaction);
          if (drop) drops[id] = drop;

          await character.save({ transaction });

          recompensas[id] = {
            experiencia: xpConcedida,
            dinheiro: ouro,
            nivel: resultadoXp.nivel,
            pontos_distribuir: resultadoXp.pontos_distribuir,
          };
        });
      } catch (error) {
        console.error(`Erro ao conceder recompensa de grupo pro personagem ${id}:`, error);
      }
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
