// Regeneração passiva de vida e mana — sem job/cron rodando em segundo
// plano, calculada sob demanda (lazy) toda vez que o personagem é lido
// ou entra em combate, a partir de quanto tempo real passou desde
// ultima_atualizacao_vida/ultima_atualizacao_mana. 12h reais pra
// regenerar de 0% até 100% do respectivo máximo.
const { vidaMaximaDe, manaMaximaDe } = require("./combatFormulas");

const DURACAO_REGEN_TOTAL_MS = 12 * 60 * 60 * 1000;

// Recalcula um recurso (vida OU mana) considerando o tempo decorrido
// desde seu próprio timestamp e, se houve progresso mensurável,
// atualiza a INSTÂNCIA do personagem (campo atual + timestamp) e o
// personagemEfetivo correspondente. Devolve true se algo mudou.
function sincronizarRegeneracao(character, personagemEfetivo, { campoAtual, campoTimestamp, maximoDe }) {
  const maximo = maximoDe(personagemEfetivo);

  if (character[campoAtual] >= maximo) {
    return false;
  }

  const desde = character[campoTimestamp]
    ? new Date(character[campoTimestamp]).getTime()
    : Date.now();
  const decorridoMs = Math.max(0, Date.now() - desde);
  if (decorridoMs <= 0) {
    return false;
  }

  const fracaoRegenerada = decorridoMs / DURACAO_REGEN_TOTAL_MS;
  const novoValor = Math.min(
    maximo,
    Math.round(character[campoAtual] + fracaoRegenerada * maximo),
  );

  if (novoValor === character[campoAtual]) {
    return false;
  }

  character[campoAtual] = novoValor;
  character[campoTimestamp] = new Date();
  personagemEfetivo[campoAtual] = novoValor;
  return true;
}

// Não persiste sozinho — quem chamar decide quando salvar (normalmente
// junto com o resto do que já estiver salvando na mesma operação).
// Devolve true se vida OU mana mudaram (útil pra decidir se vale a
// pena dar save()).
function sincronizarRegeneracaoDeVida(character, personagemEfetivo) {
  return sincronizarRegeneracao(character, personagemEfetivo, {
    campoAtual: "vida_atual",
    campoTimestamp: "ultima_atualizacao_vida",
    maximoDe: vidaMaximaDe,
  });
}

function sincronizarRegeneracaoDeMana(character, personagemEfetivo) {
  return sincronizarRegeneracao(character, personagemEfetivo, {
    campoAtual: "mana_atual",
    campoTimestamp: "ultima_atualizacao_mana",
    maximoDe: manaMaximaDe,
  });
}

// Aplica os dois de uma vez — a maioria dos chamadores quer vida e
// mana sincronizadas juntas. Devolve true se qualquer uma mudou.
function sincronizarRegeneracaoDeVidaEMana(character, personagemEfetivo) {
  const vidaMudou = sincronizarRegeneracaoDeVida(character, personagemEfetivo);
  const manaMudou = sincronizarRegeneracaoDeMana(character, personagemEfetivo);
  return vidaMudou || manaMudou;
}

// Quanto tempo (ms) falta até o recurso estar 100% regenerado, a
// partir de agora — 0 se já está cheio. Chamar DEPOIS de sincronizar,
// pra refletir o valor já atualizado.
function msAteRegenCompleta(personagemEfetivo, { campoAtual, maximoDe }) {
  const maximo = maximoDe(personagemEfetivo);
  const atual = personagemEfetivo[campoAtual] ?? 0;
  if (atual >= maximo) return 0;
  const fracaoFaltando = (maximo - atual) / maximo;
  return Math.round(fracaoFaltando * DURACAO_REGEN_TOTAL_MS);
}

function msAteVidaRegenCompleta(personagemEfetivo) {
  return msAteRegenCompleta(personagemEfetivo, { campoAtual: "vida_atual", maximoDe: vidaMaximaDe });
}

function msAteManaRegenCompleta(personagemEfetivo) {
  return msAteRegenCompleta(personagemEfetivo, { campoAtual: "mana_atual", maximoDe: manaMaximaDe });
}

module.exports = {
  DURACAO_REGEN_TOTAL_MS,
  sincronizarRegeneracaoDeVida,
  sincronizarRegeneracaoDeMana,
  sincronizarRegeneracaoDeVidaEMana,
  msAteRegenCompleta: msAteVidaRegenCompleta,
  msAteVidaRegenCompleta,
  msAteManaRegenCompleta,
};
