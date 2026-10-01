// Configuração central da Aventura em Grupo (party) — antes espalhada
// como constantes soltas em socket/partySocket.js; centralizada aqui
// pra caber no mesmo painel admin de balanceamento das outras telas de
// combate (Expedição/Aventura), seguindo o mesmo padrão de
// aplicarOverridesBalanceamento por mutação em-lugar (nunca reatribuir
// o binding do módulo) usado em forgeConfig/expeditionConfig.

let TAMANHO_MAXIMO_GRUPO = 4;
let TAMANHO_MINIMO_GRUPO = 2;
let PRAZO_CONVITE_MS = 20000;
let PRAZO_TURNO_MS = 20000;
let MAX_RODADAS = 40;

// Escala de dificuldade do monstro além do tamanho bruto do grupo
// (tamanhoGrupo já multiplica vida direto) — cada aventureiro ALÉM do
// mínimo (TAMANHO_MINIMO_GRUPO) soma esses percentuais.
let FATOR_DIFICULDADE_VIDA_POR_EXTRA = 0.12;
let FATOR_DIFICULDADE_DANO_POR_EXTRA = 0.08;

// Ideia #4 da fila de melhorias — penalidade de XP/ouro pra GRUPO
// INTEIRO quando alguém no grupo está muito acima do nível da zona
// (power-leveling: um personagem forte carrega um fraco numa área fácil
// pra ele upar rápido). Usa nivel_monstro_max da zona (o teto de nível
// que o conteúdo dali foi desenhado pra entregar) como referência, não
// o nível dos outros membros — um grupo de 2 jogadores de nível
// parecido nunca é afetado, só quando alguém destoa MUITO da zona.
//
// LIMIAR: quantos níveis ACIMA do teto da zona ainda são tolerados sem
// penalidade nenhuma (jogador ajudando um amigo perto do próprio nível,
// ou só "voltando" numa área antiga, nunca é punido). PISO: a
// recompensa nunca cai abaixo disso, mesmo com uma diferença de nível
// gigantesca — o objetivo é desincentivar FARM dedicado de boost, não
// proibir ajudar um amigo ocasionalmente nem zerar a recompensa.
let LIMIAR_NIVEL_ACIMA_DA_ZONA = 10;
let REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE = 0.05;
let PISO_MULTIPLICADOR_RECOMPENSA = 0.2;

function aplicarOverridesBalanceamento(grupo, valores) {
  if (!valores || typeof valores !== "object") return;
  if (grupo !== "party.balance") return;
  if (typeof valores.TAMANHO_MAXIMO_GRUPO === "number") {
    TAMANHO_MAXIMO_GRUPO = valores.TAMANHO_MAXIMO_GRUPO;
    module.exports.TAMANHO_MAXIMO_GRUPO = TAMANHO_MAXIMO_GRUPO;
  }
  if (typeof valores.TAMANHO_MINIMO_GRUPO === "number") {
    TAMANHO_MINIMO_GRUPO = valores.TAMANHO_MINIMO_GRUPO;
    module.exports.TAMANHO_MINIMO_GRUPO = TAMANHO_MINIMO_GRUPO;
  }
  if (typeof valores.PRAZO_CONVITE_MS === "number") {
    PRAZO_CONVITE_MS = valores.PRAZO_CONVITE_MS;
    module.exports.PRAZO_CONVITE_MS = PRAZO_CONVITE_MS;
  }
  if (typeof valores.PRAZO_TURNO_MS === "number") {
    PRAZO_TURNO_MS = valores.PRAZO_TURNO_MS;
    module.exports.PRAZO_TURNO_MS = PRAZO_TURNO_MS;
  }
  if (typeof valores.MAX_RODADAS === "number") {
    MAX_RODADAS = valores.MAX_RODADAS;
    module.exports.MAX_RODADAS = MAX_RODADAS;
  }
  if (typeof valores.FATOR_DIFICULDADE_VIDA_POR_EXTRA === "number") {
    FATOR_DIFICULDADE_VIDA_POR_EXTRA = valores.FATOR_DIFICULDADE_VIDA_POR_EXTRA;
    module.exports.FATOR_DIFICULDADE_VIDA_POR_EXTRA = FATOR_DIFICULDADE_VIDA_POR_EXTRA;
  }
  if (typeof valores.FATOR_DIFICULDADE_DANO_POR_EXTRA === "number") {
    FATOR_DIFICULDADE_DANO_POR_EXTRA = valores.FATOR_DIFICULDADE_DANO_POR_EXTRA;
    module.exports.FATOR_DIFICULDADE_DANO_POR_EXTRA = FATOR_DIFICULDADE_DANO_POR_EXTRA;
  }
  if (typeof valores.LIMIAR_NIVEL_ACIMA_DA_ZONA === "number") {
    LIMIAR_NIVEL_ACIMA_DA_ZONA = valores.LIMIAR_NIVEL_ACIMA_DA_ZONA;
    module.exports.LIMIAR_NIVEL_ACIMA_DA_ZONA = LIMIAR_NIVEL_ACIMA_DA_ZONA;
  }
  if (typeof valores.REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE === "number") {
    REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE = valores.REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE;
    module.exports.REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE = REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE;
  }
  if (typeof valores.PISO_MULTIPLICADOR_RECOMPENSA === "number") {
    PISO_MULTIPLICADOR_RECOMPENSA = valores.PISO_MULTIPLICADOR_RECOMPENSA;
    module.exports.PISO_MULTIPLICADOR_RECOMPENSA = PISO_MULTIPLICADOR_RECOMPENSA;
  }
}

module.exports = {
  TAMANHO_MAXIMO_GRUPO,
  TAMANHO_MINIMO_GRUPO,
  PRAZO_CONVITE_MS,
  PRAZO_TURNO_MS,
  MAX_RODADAS,
  FATOR_DIFICULDADE_VIDA_POR_EXTRA,
  FATOR_DIFICULDADE_DANO_POR_EXTRA,
  LIMIAR_NIVEL_ACIMA_DA_ZONA,
  REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE,
  PISO_MULTIPLICADOR_RECOMPENSA,
  aplicarOverridesBalanceamento,
};
