// Regeneração passiva de vida — sem job/cron rodando em segundo plano,
// calculada sob demanda (lazy) toda vez que o personagem é lido ou
// entra em combate, a partir de quanto tempo real passou desde
// ultima_atualizacao_vida. 12h reais pra regenerar de 0% até 100% da
// vida máxima.
const { vidaMaximaDe } = require("./combatFormulas");

const DURACAO_REGEN_TOTAL_MS = 12 * 60 * 60 * 1000;

// Recalcula vida_atual considerando o tempo decorrido e, se houve
// progresso mensurável, atualiza a INSTÂNCIA do personagem (vida_atual
// + ultima_atualizacao_vida) e o personagemEfetivo correspondente
// (pra quem já calculou bônus/multiplicadores de classe não precisar
// refazer). Não persiste sozinho — quem chamar decide quando salvar
// (normalmente junto com o resto do que já estiver salvando na mesma
// operação). Devolve true se algo mudou.
function sincronizarRegeneracaoDeVida(character, personagemEfetivo) {
  const vidaMaxima = vidaMaximaDe(personagemEfetivo);

  if (character.vida_atual >= vidaMaxima) {
    return false;
  }

  const desde = character.ultima_atualizacao_vida
    ? new Date(character.ultima_atualizacao_vida).getTime()
    : Date.now();
  const decorridoMs = Math.max(0, Date.now() - desde);
  if (decorridoMs <= 0) {
    return false;
  }

  const fracaoRegenerada = decorridoMs / DURACAO_REGEN_TOTAL_MS;
  const novaVida = Math.min(
    vidaMaxima,
    Math.round(character.vida_atual + fracaoRegenerada * vidaMaxima),
  );

  if (novaVida === character.vida_atual) {
    return false;
  }

  character.vida_atual = novaVida;
  character.ultima_atualizacao_vida = new Date();
  personagemEfetivo.vida_atual = novaVida;
  return true;
}

// Quanto tempo (ms) falta até a vida estar 100% regenerada, a partir
// de agora — 0 se já está cheia. Chamar DEPOIS de
// sincronizarRegeneracaoDeVida, pra refletir o valor já atualizado.
function msAteRegenCompleta(personagemEfetivo) {
  const vidaMaxima = vidaMaximaDe(personagemEfetivo);
  const vidaAtual = personagemEfetivo.vida_atual ?? 0;
  if (vidaAtual >= vidaMaxima) return 0;
  const fracaoFaltando = (vidaMaxima - vidaAtual) / vidaMaxima;
  return Math.round(fracaoFaltando * DURACAO_REGEN_TOTAL_MS);
}

module.exports = {
  DURACAO_REGEN_TOTAL_MS,
  sincronizarRegeneracaoDeVida,
  msAteRegenCompleta,
};
