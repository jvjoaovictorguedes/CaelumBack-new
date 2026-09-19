// src/services/pveEncounterService.js
//
// Fonte única da validade de um encontro de combate salvo num campo
// JSONB do personagem (character.encontro_pve) — antes vivia só dentro
// de combatController.js, e characterInventoryController.js (bloqueio
// de consumível em combate) checava o campo cru (`if
// (character.encontro_pve)`) sem passar pela mesma regra de expiração.
// Resultado: depois que um encontro expirava (30min sem terminar a
// luta), combatController via ele como "sem combate ativo" mas o
// bloqueio de poção continuava lendo o campo cru — ainda preenchido,
// nunca limpo — e travava consumíveis pra sempre até o jogador gerar
// um inimigo novo. Com todo mundo usando estas mesmas funções (que
// também LIMPAM o campo expirado), o estado fica consistente.
//
// As funções `*DoCampo*` genéricas continuam existindo porque a
// Aventura já as usa pra checar exclusão mútua entre zonas
// (adventureController.js) — o Portal de Ranque individual, que usava
// o mesmo padrão num campo próprio, foi removido (ver migration
// 20260930780000).
const VALIDADE_ENCONTRO_MS = 30 * 60 * 1000;

// Devolve uma CÓPIA do encontro válido (ou null) daquele campo, nunca a
// referência crua: quem chama costuma mutar o objeto in-place (ex.:
// inimigoAtual.vida_atual -= dano) conforme o combate avança, e se
// fosse a mesma referência guardada em character.dataValues, o
// Sequelize não detectaria diferença nenhuma na hora de reatribuir
// `character.encontro_pve = inimigoAtual` no final (mesmo objeto, "nada
// mudou" do ponto de vista do dirty-check) — o campo simplesmente não
// seria salvo.
function encontroDoCampoValido(character, campo) {
  const encontro = character[campo];
  if (!encontro) return null;
  if (Date.now() - encontro.criadoEm > VALIDADE_ENCONTRO_MS) return null;
  return { ...encontro };
}

// Limpa o campo em memória (character[campo] = null) quando o encontro
// existe mas já expirou — quem chama ainda precisa dar
// `await character.save()` (ou `.save({ transaction })`) pra persistir.
// Devolve `true` se havia algo pra limpar, só por conveniência de quem
// quiser decidir se vale a pena salvar.
function limparEncontroDoCampoExpirado(character, campo) {
  if (character[campo] && !encontroDoCampoValido(character, campo)) {
    character[campo] = null;
    return true;
  }
  return false;
}

function encontroValido(character) {
  return encontroDoCampoValido(character, "encontro_pve");
}

function limparEncontroExpirado(character) {
  return limparEncontroDoCampoExpirado(character, "encontro_pve");
}

module.exports = {
  VALIDADE_ENCONTRO_MS,
  encontroValido,
  limparEncontroExpirado,
  encontroDoCampoValido,
  limparEncontroDoCampoExpirado,
};
