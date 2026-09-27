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
}

module.exports = {
  TAMANHO_MAXIMO_GRUPO,
  TAMANHO_MINIMO_GRUPO,
  PRAZO_CONVITE_MS,
  PRAZO_TURNO_MS,
  MAX_RODADAS,
  FATOR_DIFICULDADE_VIDA_POR_EXTRA,
  FATOR_DIFICULDADE_DANO_POR_EXTRA,
  aplicarOverridesBalanceamento,
};
