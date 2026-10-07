const { custoManaEfetivo } = require("../services/combatFormulas");

function poderesPublicos(poderes) {
  return poderes.map((p) => ({
    id: p.id,
    combat_slot: p.combat_slot,
    nome: p.nome,
    imagem_url: p.imagem_url ?? null,
    custo_mana: custoManaEfetivo(p, p.nivel_habilidade ?? 1),
    dano_base: p.dano_base,
    cura_base: p.cura_base,
    nivel_habilidade: p.nivel_habilidade ?? 1,
    escala_atributo: p.escala_atributo,
    valor_escala: p.valor_escala,
  }));
}

function montarPayloadDuelo(duelo, prazoTurnoMs = 5000) {
  return {
    duelId: duelo.id,
    arena: duelo.arena,
    torneio: duelo.torneio,
    a: { id: duelo.a.id, nome: duelo.a.nome, genero: duelo.a.genero, classe: duelo.a.classe, chave: "A" },
    b: { id: duelo.b.id, nome: duelo.b.nome, genero: duelo.b.genero, classe: duelo.b.classe, chave: "B" },
    vidaMaxA: duelo.a.vidaMax,
    vidaMaxB: duelo.b.vidaMax,
    manaMaxA: duelo.a.manaMax,
    manaMaxB: duelo.b.manaMax,
    vidaA: duelo.a.estado.vida_atual,
    vidaB: duelo.b.estado.vida_atual,
    manaA: duelo.a.estado.mana_atual,
    manaB: duelo.b.estado.mana_atual,
    poderesA: poderesPublicos(duelo.a.poderes),
    poderesB: poderesPublicos(duelo.b.poderes),
    consumiveisA: duelo.a.consumiveis,
    consumiveisB: duelo.b.consumiveis,
    turnoDe: duelo.turnoDe,
    prazoSegundos: prazoTurnoMs / 1000,
  };
}

function montarPayloadTurno({ duelo, duelId, chave, bloqueado, nomeAcao, foiAutomatico, dano, cura, manaCurada, esquivou, critico, logStatus }) {
  return {
    duelId,
    atacante: chave,
    nomeAcao: bloqueado ? nomeAcao : foiAutomatico ? `${nomeAcao} (tempo esgotado)` : nomeAcao,
    dano,
    cura,
    manaCurada,
    esquivou,
    critico: Boolean(critico),
    bloqueado: Boolean(bloqueado),
    logStatus,
    statusA: duelo.statusEffects.A.map((s) => ({ key: s.key, remainingTurns: s.remainingTurns, stacks: s.stacks })),
    statusB: duelo.statusEffects.B.map((s) => ({ key: s.key, remainingTurns: s.remainingTurns, stacks: s.stacks })),
    // Habilidades V2.0 (item 10) — combatBuffs já era rastreado em
    // duelo.combatBuffs (ver resolverTurnoComStatus acima), mas nunca
    // chegava no payload do socket, então o frontend nunca tinha como
    // mostrar os ícones de buff/debuff do duelo ao vivo.
    combatBuffsA: (duelo.combatBuffs?.A ?? []).map((b) => ({ atributo: b.atributo, valor: b.valor, remainingTurns: b.remainingTurns })),
    combatBuffsB: (duelo.combatBuffs?.B ?? []).map((b) => ({ atributo: b.atributo, valor: b.valor, remainingTurns: b.remainingTurns })),
    vidaA: duelo.a.estado.vida_atual,
    vidaB: duelo.b.estado.vida_atual,
    manaA: duelo.a.estado.mana_atual,
    manaB: duelo.b.estado.mana_atual,
  };
}

function montarPayloadFim({ duelId, vencedorChave, vencedor, perdedor, recompensa, nivelAposVitoria, motivo }) {
  return { duelId, vencedorChave, vencedor: { id: vencedor.id, nome: vencedor.nome }, perdedor: { id: perdedor.id, nome: perdedor.nome }, recompensa, nivelAposVitoria, motivo };
}

module.exports = { poderesPublicos, montarPayloadDuelo, montarPayloadTurno, montarPayloadFim };
