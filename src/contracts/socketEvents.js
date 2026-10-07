// Public event names. Changes require compatible clients.
const SOCKET_EVENTS = {
  "GUILDBOSS": {
    "ACAO": "guildboss:acao",
    "BATALHA_FIM": "guildboss:batalha-fim",
    "BATALHA_INICIADA": "guildboss:batalha-iniciada",
    "CAST_START": "guildboss:cast-start",
    "ENTRAR": "guildboss:entrar",
    "ERRO": "guildboss:erro",
    "ESTADO": "guildboss:estado",
    "MEMBRO_ENTROU": "guildboss:membro-entrou",
    "PROXIMO_TURNO": "guildboss:proximo-turno",
    "SAIR": "guildboss:sair",
    "TURNO_RESULTADO": "guildboss:turno-resultado"
  },
  "TRANSPORT": {
    "IDENTIFY": "identificar"
  },
  "PARTY": {
    "ACAO": "party:acao",
    "BATALHA_ESTADO": "party:batalha-estado",
    "BATALHA_FIM": "party:batalha-fim",
    "BATALHA_INICIADA": "party:batalha-iniciada",
    "CONVIDAR": "party:convidar",
    "CONVITE_CANCELADO": "party:convite-cancelado",
    "CONVITE_ENVIADO": "party:convite-enviado",
    "CONVITE_EXPIRADO": "party:convite-expirado",
    "CONVITE_RECEBIDO": "party:convite-recebido",
    "CONVITE_RECUSADO": "party:convite-recusado",
    "CRIAR": "party:criar",
    "ENTRAR_BATALHA": "party:entrar-batalha",
    "ERRO": "party:erro",
    "EXPULSAR": "party:expulsar",
    "EXPULSO": "party:expulso",
    "GRUPO_ATUALIZADO": "party:grupo-atualizado",
    "GRUPO_DESFEITO": "party:grupo-desfeito",
    "INICIAR": "party:iniciar",
    "LISTAR_ONLINE": "party:listar-online",
    "PRONTO": "party:pronto",
    "PROXIMO_TURNO": "party:proximo-turno",
    "RESPONDER_CONVITE": "party:responder-convite",
    "SAIR": "party:sair",
    "TURNO_RESULTADO": "party:turno-resultado"
  },
  "PVP": {
    "ACAO": "pvp:acao",
    "DESAFIAR": "pvp:desafiar",
    "DESAFIO_CANCELADO": "pvp:desafio-cancelado",
    "DESAFIO_ENVIADO": "pvp:desafio-enviado",
    "DESAFIO_EXPIRADO": "pvp:desafio-expirado",
    "DESAFIO_RECEBIDO": "pvp:desafio-recebido",
    "DESAFIO_RECUSADO": "pvp:desafio-recusado",
    "DUELO_FIM": "pvp:duelo-fim",
    "DUELO_INICIADO": "pvp:duelo-iniciado",
    "ERRO": "pvp:erro",
    "FICOU_OFFLINE": "pvp:ficou-offline",
    "FICOU_ONLINE": "pvp:ficou-online",
    "LISTAR_ONLINE": "pvp:listar-online",
    "RESPONDER_DESAFIO": "pvp:responder-desafio",
    "TURNO_RESULTADO": "pvp:turno-resultado"
  },
  "RANKED": {
    "MATCH_FOUND": "ranked:match:found",
    "MATCH_START": "ranked:match:start",
    "OPONENTE_DESCONECTADO": "ranked:oponente-desconectado",
    "OPONENTE_RECONECTADO": "ranked:oponente-reconectado",
    "QUEUE_JOIN": "ranked:queue:join",
    "QUEUE_LEAVE": "ranked:queue:leave",
    "QUEUE_UPDATE": "ranked:queue:update",
    "RATING_UPDATE": "ranked:rating:update"
  },
  "TORNEIO": {
    "DUELO_INICIADO": "torneio:duelo-iniciado",
    "ENTRAR_SALA": "torneio:entrar-sala",
    "ERRO": "torneio:erro",
    "PRONTO": "torneio:pronto",
    "SERIE_ATUALIZADA": "torneio:serie:atualizada",
    "SERIE_PLACAR": "torneio:serie:placar"
  },
  "WORLDBOSS": {
    "ACAO": "worldboss:acao",
    "ENTRAR": "worldboss:entrar",
    "ENTRAR_COMBATE": "worldboss:entrar-combate",
    "ESTADO": "worldboss:estado",
    "GLOBAL": "worldboss:global",
    "IDENTIFICAR": "worldboss:identificar",
    "SAIR": "worldboss:sair",
    "STATUS": "worldboss:status"
  }
};
for (const domain of Object.values(SOCKET_EVENTS)) Object.freeze(domain);
module.exports = Object.freeze(SOCKET_EVENTS);
