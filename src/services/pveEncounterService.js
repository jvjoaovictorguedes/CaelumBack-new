// src/services/pveEncounterService.js
//
// Fonte única da validade do encontro PvE (character.encontro_pve) —
// antes vivia só dentro de combatController.js, e characterInventoryController.js
// (bloqueio de consumível em combate) checava o campo cru
// (`if (character.encontro_pve)`) sem passar pela mesma regra de
// expiração. Resultado: depois que um encontro expirava (30min sem
// terminar a luta), combatController via ele como "sem combate ativo"
// mas o bloqueio de poção continuava lendo o campo cru — ainda
// preenchido, nunca limpo — e travava consumíveis pra sempre até o
// jogador gerar um inimigo novo. Com os dois lados usando esta mesma
// função (que também LIMPA o campo expirado), o estado fica
// consistente nos dois lugares.
const VALIDADE_ENCONTRO_MS = 30 * 60 * 1000;

// Devolve uma CÓPIA do encontro válido (ou null), nunca a referência
// crua de character.encontro_pve: quem chama costuma mutar o objeto
// in-place (ex.: inimigoAtual.vida_atual -= dano) conforme o combate
// avança, e se fosse a mesma referência guardada em
// character.dataValues, o Sequelize não detectaria diferença nenhuma na
// hora de reatribuir `character.encontro_pve = inimigoAtual` no final
// (mesmo objeto, "nada mudou" do ponto de vista do dirty-check) — o
// campo simplesmente não seria salvo.
function encontroValido(character) {
  const encontro = character.encontro_pve;
  if (!encontro) return null;
  if (Date.now() - encontro.criadoEm > VALIDADE_ENCONTRO_MS) return null;
  return { ...encontro };
}

// Limpa o campo em memória (character.encontro_pve = null) quando o
// encontro existe mas já expirou — quem chama ainda precisa dar
// `await character.save()` (ou `.save({ transaction })`) pra persistir.
// Devolve `true` se havia algo pra limpar, só por conveniência de quem
// quiser decidir se vale a pena salvar.
function limparEncontroExpirado(character) {
  if (character.encontro_pve && !encontroValido(character)) {
    character.encontro_pve = null;
    return true;
  }
  return false;
}

module.exports = { VALIDADE_ENCONTRO_MS, encontroValido, limparEncontroExpirado };
