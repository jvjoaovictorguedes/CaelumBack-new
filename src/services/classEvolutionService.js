// Evolução de CLASSE — pedido do jogador: um upgrade de nível mais alto
// que o sistema de Evolution já existente (que é por natureza mágica,
// gated só por nível+ouro). Aqui é único, definitivo, e exige uma
// Relíquia de Ascensão específica da classe (item Mítico — a raridade
// mais rara do catálogo, ver dropService.js) além do nível alto. Dá um
// título de exibição novo e um bônus permanente nos multiplicadores de
// combate da classe.
const NIVEL_MINIMO_EVOLUCAO = 40;
const MULTIPLICADOR_BONUS_EVOLUCAO = 1.15;

const REQUISITOS_EVOLUCAO_POR_CLASSE = {
  Guerreiro: {
    nivelMinimo: NIVEL_MINIMO_EVOLUCAO,
    nomeItem: "Coração de Titã",
    nomeEvoluido: "Titã de Caelum",
  },
  Mago: {
    nivelMinimo: NIVEL_MINIMO_EVOLUCAO,
    nomeItem: "Olho do Arcano Eterno",
    nomeEvoluido: "Arquimago Eterno",
  },
};

function requisitoDaClasse(nomeClasse) {
  return REQUISITOS_EVOLUCAO_POR_CLASSE[nomeClasse] ?? null;
}

module.exports = {
  NIVEL_MINIMO_EVOLUCAO,
  MULTIPLICADOR_BONUS_EVOLUCAO,
  REQUISITOS_EVOLUCAO_POR_CLASSE,
  requisitoDaClasse,
};
