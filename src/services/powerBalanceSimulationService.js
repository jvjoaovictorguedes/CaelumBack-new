// Rebalanceamento de Powers §27 — simulador de balanceamento real. Nunca
// reimplementa fórmula: reaproveita combatFormulas (mesmo
// calcularEfeitoPoderEsperado/aplicarMitigacaoDeDefesa/
// comMultiplicadoresDeClasse usados em combatController) e
// combatModifierService.magnitudeEfetiva (mesma função do preview do
// Admin) pra passivas.
//
// LIMITAÇÕES DECLARADAS (§34 "não declare perfeitamente balanceado,
// declare só o que foi medido"):
// - Atributos de personagem sintético são uma aproximação documentada,
//   NÃO a curva real de distribuição de pontos do jogador (que é livre,
//   PONTOS_POR_NIVEL=4/nível — ver experienceService.js): aqui assume-se
//   o cenário "tudo investido no atributo de escala da própria Power"
//   (base 10 + nível*4), o pior caso de estresse pra detectar outlier,
//   nunca a média real de personagens existentes.
// - Monstro alvo sintético (defesa/vida_maxima por nível) é uma curva
//   simplificada pra comparação RELATIVA entre Powers no mesmo nível/
//   alvo, não a curva real de AdventureMonster por zona.
// - nivel_aprendizagem de cada Power usa a ORDEM de declaração no
//   catálogo canônico (migration 20270214010000) como proxy de
//   progressão (mais básico → capstone), porque ClassAbilities não é
//   populável neste ambiente de simulação sem um personagem real salvo
//   no banco (ver nota em powerCatalogAuditService.js sobre
//   Classes/Races existirem só via seeder).
const F = require("./combatFormulas");
const { multiplicadorCustoMana } = require("./abilityLevelService");
const { magnitudeEfetiva } = require("./combatModifierService");

const NIVEIS_PERSONAGEM = [10, 20, 30, 40];
const NIVEIS_HABILIDADE = [1, 5, 10];
// §27 pede as 10 famílias (HUMANOID/BEAST/INSECT/PLANT/AQUATIC/UNDEAD/
// SPIRIT/CONSTRUCT/DRAGON/DEMON) como alvo representativo. LACUNA
// DECLARADA desta entrega: o multiplicador de afinidade por família
// (combatTypingService.resolveDamage/monsterProfile) NÃO entrou no
// cálculo abaixo — dano_pos_defesa usa só aplicarMitigacaoDeDefesa
// (Defesa), nunca o matchup elemental/família. Medir isso de verdade
// exigiria popular MonsterFamily/CombatAffinityProfile reais (que só
// existem via seeder, não migration, no banco de teste deste ambiente —
// mesma limitação documentada em powerCatalogAuditService.js) com
// confiança de que o perfil é representativo. Rodar esta lacuna fica
// pro próximo ciclo, citada explicitamente no relatório final (§34).
const FAMILIAS_REPRESENTATIVAS = ["HUMANOID", "BEAST", "INSECT", "PLANT", "AQUATIC", "UNDEAD", "SPIRIT", "CONSTRUCT", "DRAGON", "DEMON"];

const CLASSES_REFERENCIA = {
  Guerreiro: { multiplicador_dano_fisico: 1.2, multiplicador_dano_magico: 0.6, multiplicador_vida_por_nivel: 1.3, multiplicador_mana_por_nivel: 0.7 },
  Mago: { multiplicador_dano_fisico: 0.5, multiplicador_dano_magico: 1.3, multiplicador_vida_por_nivel: 0.8, multiplicador_mana_por_nivel: 1.4 },
};

const ATRIBUTO_PARA_CAMPO = { Forca: "forca", Vitalidade: "vitalidade", Agilidade: "agilidade", Inteligencia: "inteligencia", Velocidade: "velocidade" };

function personagemSintetico(nivelPersonagem, power, classeNome) {
  const campo = ATRIBUTO_PARA_CAMPO[power.escala_atributo] ?? "forca";
  const base = { nivel: nivelPersonagem, forca: 10, vitalidade: 10, agilidade: 10, inteligencia: 10, velocidade: 10 };
  base[campo] = 10 + nivelPersonagem * 4;
  return F.comMultiplicadoresDeClasse(base, CLASSES_REFERENCIA[classeNome]);
}

// Dano esperado de DoT (status percentual) numa janela completa de
// duration_turns, contra o vida_maxima sintético do alvo. Reaproveita
// EXATAMENTE a fórmula de statusEffectService.calcularDanoDoTick
// (vidaMaxima * (percentualVidaMaxima / 100) * stacks, UMA VEZ POR TICK,
// nunca percentual_vida_maxima como fração direta — 0.50 na config
// significa 0,50%/tick, não 50%/tick) multiplicada pelo número de ticks
// (duration_turns) e pela chance esperada (chance_ppm já convertido).
function dotEsperado(power, vidaMaximaAlvo) {
  let total = 0;
  for (const status of power.status ?? []) {
    if (!status.percentual_vida_maxima) continue;
    const chance = (status.chance_ppm ?? 1_000_000) / 1_000_000;
    const danoPorTick = vidaMaximaAlvo * (status.percentual_vida_maxima / 100);
    total += chance * danoPorTick * (status.duration_turns ?? 1);
  }
  return Math.round(total);
}

function controleDe(power) {
  const CHAVES_DE_CONTROLE = ["STUN", "FREEZE", "PARALYZE"];
  const linha = (power.status ?? []).find((s) => CHAVES_DE_CONTROLE.includes(s.status_key));
  if (!linha) return null;
  return { status_key: linha.status_key, chance_pct: Math.round(((linha.chance_ppm ?? 1_000_000) / 1_000_000) * 100), duration_turns: linha.duration_turns ?? 1 };
}

// magnitude de PASSIVE no nível de habilidade informado — mesma função
// usada pelo preview do Admin (adminPowerService.previewCombinadoPorNivel).
function magnitudePassivaNoNivel(power, nivelPersonagemSintetico, nivelHabilidade) {
  const linhasPassivas = (power.combatEffects ?? []).filter((e) => e.trigger === "PASSIVE");
  if (!linhasPassivas.length) return null;
  return linhasPassivas.map((e) => ({
    effect_key: e.effect_key,
    magnitude: Math.round(magnitudeEfetiva({ magnitude_base: e.magnitude_base, scale_attribute: e.scale_attribute, scale_value: e.scale_value, scale_with_ability_level: e.scale_with_ability_level }, nivelPersonagemSintetico, nivelHabilidade) * 100) / 100,
  }));
}

// -------------------------------------------------------------- PÚBLICO
// `powersCanonicas` = migration.POWERS (ver test/powerRebalanceCatalog.
// test.js) — nunca um mock paralelo. `classeDePower(power)` decide
// Guerreiro/Mago pro multiplicador de classe a aplicar (heurística: usa
// Forca/Agilidade→Guerreiro, Inteligencia→Mago; Powers de raça/natureza/
// celestial são simuladas nos DOIS perfis de classe, já que qualquer
// classe pode aprendê-las).
async function simularCatalogo(powersCanonicas) {
  const resultados = [];
  for (const power of powersCanonicas) {
    const exclusivaDe = power.escala_atributo === "Inteligencia" ? "Mago" : power.escala_atributo === "Forca" || power.escala_atributo === "Agilidade" ? "Guerreiro" : null;
    const classesParaSimular = exclusivaDe ? [exclusivaDe] : ["Guerreiro", "Mago"];

    for (const classeNome of classesParaSimular) {
      for (const nivelPersonagem of NIVEIS_PERSONAGEM) {
        const personagem = personagemSintetico(nivelPersonagem, power, classeNome);
        for (const nivelHabilidade of NIVEIS_HABILIDADE) {
          const { dano: danoBruto, cura } = F.calcularEfeitoPoderEsperado(power, personagem, nivelHabilidade);
          const vidaMaximaAlvoMedia = 200 + nivelPersonagem * 40;
          const danoPosDefesa = F.aplicarMitigacaoDeDefesa(danoBruto, { defesa: Math.round(nivelPersonagem * 1.5) });
          const custoMana = Math.round(power.custo_mana * multiplicadorCustoMana(nivelHabilidade));
          const cooldown = power.cooldown ?? 0;
          const danoPorTurno = power.tipo_poder === "Ativo" ? Math.round((danoPosDefesa / Math.max(1, cooldown + 1)) * 100) / 100 : 0;
          resultados.push({
            power: power.nome,
            classe_simulada: classeNome,
            exclusiva_da_classe: Boolean(exclusivaDe),
            nivel_personagem: nivelPersonagem,
            nivel_habilidade: nivelHabilidade,
            dano_bruto: danoBruto,
            dano_pos_defesa: danoPosDefesa,
            cura_bruta: cura,
            custo_mana: custoMana,
            cooldown,
            dano_por_turno: danoPorTurno,
            dot_esperado: dotEsperado(power, vidaMaximaAlvoMedia),
            controle: controleDe(power),
            passivas: power.tipo_poder === "Passivo" ? magnitudePassivaNoNivel(power, personagem, nivelHabilidade) : null,
          });
        }
      }
    }
  }
  return resultados;
}

// Listas EXPLÍCITAS (nome, na ordem real §8/§9 da migration
// 20270214010000) — nunca inferidas por escala_atributo, que também é
// usado por Powers de raça/natureza/Celestial que escalam o mesmo
// atributo sem serem parte da progressão de Guerreiro/Mago. Única forma
// confiável de achar "o capstone real" neste ambiente (ClassAbilities
// não é populável aqui — ver limitação no topo do arquivo).
const PROGRESSAO_GUERREIRO = ["Golpe Poderoso", "Corte Selvagem", "Investida Brutal", "Investida Relâmpago", "Fúria de Aço", "Couraça de Batalha", "Golpe Retumbante", "Brado de Guerra", "Instinto Assassino", "Investida Devastadora", "Pele de Ferro", "Golpe Sísmico", "Fúria Implacável", "Golpe do Titã"];
const PROGRESSAO_MAGO = ["Cura Arcana", "Bola de Fogo", "Mísseis Arcanos", "Lança de Gelo", "Escudo de Mana", "Fluxo Arcano", "Explosão Arcana", "Corrente Arcana", "Mente Afiada", "Renascer Místico", "Nova Congelante", "Reserva Arcana", "Tempestade Arcana", "Meteoro Arcano", "Colapso Dimensional"];

// §27 — outliers EXPLICITAMENTE listados na especificação, só os que dão
// pra calcular com o que o simulador já produz. Cada finding carrega os
// números reais que motivaram a flag — nunca um veredito sem medição.
function detectarOutliers(resultados) {
  const findings = [];
  const porPowerNivel10 = resultados.filter((r) => r.nivel_habilidade === 10 && r.nivel_personagem === 40);

  // a) Power aprendida cedo (posição na PROGRESSAO_* real) com DPT >= o
  // capstone (última da lista) da MESMA classe.
  for (const [classeNome, progressao] of [["Guerreiro", PROGRESSAO_GUERREIRO], ["Mago", PROGRESSAO_MAGO]]) {
    const linhas = progressao
      .map((nome) => porPowerNivel10.find((r) => r.power === nome && r.classe_simulada === classeNome))
      .filter((r) => r && r.dano_por_turno > 0);
    if (linhas.length < 2) continue;
    const capstone = linhas[linhas.length - 1];
    const maisForte = [...linhas].sort((a, b) => b.dano_por_turno - a.dano_por_turno)[0];
    if (maisForte.power !== capstone.power && maisForte.dano_por_turno >= capstone.dano_por_turno) {
      findings.push({
        categoria: "DPT_MAIOR_QUE_CAPSTONE",
        detalhe: `${classeNome}: "${maisForte.power}" (DPT=${maisForte.dano_por_turno}) >= capstone real "${capstone.power}" (DPT=${capstone.dano_por_turno}).`,
      });
    }
  }

  // b) controle forte (chance >= 50%) que também está no top-3 de DPT
  // da mesma classe simulada (qualquer Power simulada como essa classe,
  // de raça/natureza inclusive — aqui não importa progressão real,
  // importa só "o jogador desta classe pode ter isso no loadout").
  const porClasse = new Map();
  for (const r of porPowerNivel10) {
    if (!r.dano_por_turno) continue;
    const lista = porClasse.get(r.classe_simulada) ?? [];
    lista.push(r);
    porClasse.set(r.classe_simulada, lista);
  }
  for (const [classeNome, lista] of porClasse) {
    const top3 = [...lista].sort((a, b) => b.dano_por_turno - a.dano_por_turno).slice(0, 3).map((r) => r.power);
    for (const r of lista) {
      if (r.controle && r.controle.chance_pct >= 50 && top3.includes(r.power)) {
        findings.push({
          categoria: "CONTROLE_FORTE_E_TOP_DPT",
          detalhe: `${classeNome}: "${r.power}" tem ${r.controle.status_key} ${r.controle.chance_pct}% E está no top-3 de DPT (${r.dano_por_turno}).`,
        });
      }
    }
  }

  // c) cura com eficiência (cura/mana) muito acima da mediana das Powers
  // de cura do mesmo nível 10/40.
  const curas = porPowerNivel10.filter((r) => r.cura_bruta > 0 && r.custo_mana > 0).map((r) => ({ ...r, eficiencia: r.cura_bruta / r.custo_mana }));
  if (curas.length >= 3) {
    const ordenadas = [...curas].sort((a, b) => a.eficiencia - b.eficiencia);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)].eficiencia;
    for (const c of curas) {
      if (mediana > 0 && c.eficiencia > mediana * 1.5) {
        findings.push({
          categoria: "CURA_DESPROPORCIONAL",
          detalhe: `"${c.power}" (${c.classe_simulada}): eficiência cura/Mana=${c.eficiencia.toFixed(2)}, mediana do catálogo=${mediana.toFixed(2)}.`,
        });
      }
    }
  }

  // d) passiva *_PCT com magnitude >= 25 no nível de habilidade máximo —
  // teto arbitrário de revisão manual, nunca um "errado" automático.
  for (const r of porPowerNivel10) {
    for (const p of r.passivas ?? []) {
      if (p.effect_key.endsWith("_PCT") && Math.abs(p.magnitude) >= 25) {
        findings.push({
          categoria: "PASSIVA_PCT_ALTA_NO_NIVEL_MAXIMO",
          detalhe: `"${r.power}": ${p.effect_key}=${p.magnitude} no nível de habilidade 10.`,
        });
      }
    }
  }

  // e) DoT esperado dominando o dano direto (DoT > dano_pos_defesa) —
  // §27 "DoT dominando bosses".
  for (const r of porPowerNivel10) {
    if (r.dot_esperado > 0 && r.dano_pos_defesa > 0 && r.dot_esperado > r.dano_pos_defesa) {
      findings.push({
        categoria: "DOT_MAIOR_QUE_DANO_DIRETO",
        detalhe: `"${r.power}" (${r.classe_simulada}): dot_esperado=${r.dot_esperado} > dano_pos_defesa=${r.dano_pos_defesa}.`,
      });
    }
  }

  return findings;
}

module.exports = {
  simularCatalogo,
  detectarOutliers,
  NIVEIS_PERSONAGEM,
  NIVEIS_HABILIDADE,
  FAMILIAS_REPRESENTATIVAS,
};
