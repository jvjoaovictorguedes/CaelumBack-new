// scripts/balance-audit.js
//
// Auditoria SOMENTE LEITURA do catálogo de combate (§47/§48 da
// Especificação Consolidada Poder/Status/Cooldown/Balanceamento) — nunca
// escreve no banco. Usa o Power Score (Fase 1, combatPowerService.js)
// pra desenhar a curva de Poder em perfis de referência (§49) e roda um
// SUBCONJUNTO dos detectores de anomalia do §71 — só os que dá pra
// checar sem simular combate de verdade turno a turno.
//
// scripts/simulate-balance.js (o simulador completo do §46, com
// Mana/Cooldown/Status/stacks/DoT/esquiva/Party/seed de RNG) NÃO foi
// construído nesta rodada — é um trabalho grande por si só, e sem ele
// boa parte dos detectores do §71 (uptime de Silence, DPS de proc de
// item vs arma, etc.) não tem como rodar de verdade. Isso está
// registrado aqui e no relatório final como pendência explícita — nunca
// se finge que a auditoria é completa.
//
// Como rodar: node scripts/balance-audit.js
// Saída: scripts/balance-audit-output/{items,abilities,status-effects,benchmarks,anomalies}.json
"use strict";

const fs = require("fs");
const path = require("path");

const { sequelize } = require("../src/config/database");
require("../src/models/associations");
// Mesmo padrão dos testes (ver test/helpers/db.js) — essas associações
// são registradas inline nesses controllers, não em associations.js.
require("../src/controllers/characterController");
require("../src/controllers/characterAbilitiesController");

const Item = require("../src/models/Item");
const WeaponProperties = require("../src/models/WeaponProperties");
const ArmorProperties = require("../src/models/ArmorProperties");
const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
const combatPowerService = require("../src/services/combatPowerService");
const { calcularEfeitoPoderEsperado } = require("../src/services/combatFormulas");

const DIR_SAIDA = path.join(__dirname, "balance-audit-output");

function salvar(nome, dados) {
  fs.mkdirSync(DIR_SAIDA, { recursive: true });
  fs.writeFileSync(path.join(DIR_SAIDA, `${nome}.json`), JSON.stringify(dados, null, 2));
  console.log(`[audit] ${nome}.json (${Array.isArray(dados) ? dados.length : Object.keys(dados).length} entradas de topo)`);
}

// §53 — ordem esperada de Tier, do mais fraco pro mais forte.
const ORDEM_TIER = ["V", "IV", "III", "II", "I"];

async function auditarItems() {
  const items = await Item.findAll({
    include: [
      { model: WeaponProperties, as: "weaponProperties", required: false },
      { model: ArmorProperties, as: "armorProperties", required: false },
    ],
  });

  const porTier = {};
  const mediaDanoArmaPorTier = {};
  const contagemArmaPorTier = {};

  const linhas = items.map((item) => {
    const tier = item.tier_equipamento || "SemTier";
    porTier[tier] = (porTier[tier] || 0) + 1;

    if (item.weaponProperties) {
      const media = (item.weaponProperties.dano_min + item.weaponProperties.dano_max) / 2;
      mediaDanoArmaPorTier[tier] = (mediaDanoArmaPorTier[tier] || 0) + media;
      contagemArmaPorTier[tier] = (contagemArmaPorTier[tier] || 0) + 1;
    }

    return {
      id: item.id,
      nome: item.nome,
      tipo_item: item.tipo_item,
      raridade: item.raridade,
      tier_equipamento: item.tier_equipamento,
    };
  });

  for (const tier of Object.keys(mediaDanoArmaPorTier)) {
    mediaDanoArmaPorTier[tier] = Math.round((mediaDanoArmaPorTier[tier] / contagemArmaPorTier[tier]) * 10) / 10;
  }

  return { total: items.length, porTier, mediaDanoArmaPorTier, linhas };
}

async function auditarAbilities() {
  const powers = await Power.findAll({ include: [{ model: PowerStatusEffect, as: "efeitosDeStatus" }] });
  const linhas = powers.map((power) => ({
    id: power.id,
    nome: power.nome,
    tipo_poder: power.tipo_poder,
    custo_mana: power.custo_mana,
    dano_base: power.dano_base,
    cura_base: power.cura_base,
    cooldown: power.cooldown ?? 0,
    efeitosDeStatus: power.efeitosDeStatus.map((e) => ({
      status_key: e.status_key,
      chance_ppm: e.chance_ppm,
      duration_turns: e.duration_turns,
      potency_base: e.potency_base,
    })),
  }));
  return { total: powers.length, linhas };
}

// §49/§50 — perfis de referência por faixa. Atributos SINTÉTICOS
// (2 pontos por nível em cada stat, sem equipamento), não personagens
// reais — servem só pra desenhar a FORMA da curva de Poder por nível,
// não um valor "verdadeiro" de personagem nenhum. Marcado explicitamente
// como simplificação (ver relatório final).
const NIVEIS_DE_BENCHMARK = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

function snapshotSintetico(nivel) {
  const atributo = Math.max(5, nivel * 2);
  return {
    nivel,
    forca: atributo,
    vitalidade: atributo,
    agilidade: atributo,
    inteligencia: atributo,
    velocidade: atributo,
    defesa: Math.round(atributo * 0.5),
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    habilidadesAtivas: [],
  };
}

function auditarBenchmarks() {
  return NIVEIS_DE_BENCHMARK.map((nivel) => ({
    nivel,
    ...combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotSintetico(nivel)),
  }));
}

// §71 — subconjunto automatizável sem simulador.
async function detectarAnomalias({ items, abilities }) {
  const anomalias = [];

  // 1) Tier inferior superando Tier superior no dano médio de arma.
  const tiersComDado = ORDEM_TIER.filter((t) => items.mediaDanoArmaPorTier[t] !== undefined);
  for (let i = 0; i < tiersComDado.length - 1; i += 1) {
    const tierMaisFraco = tiersComDado[i];
    const tierMaisForte = tiersComDado[i + 1];
    if (items.mediaDanoArmaPorTier[tierMaisFraco] > items.mediaDanoArmaPorTier[tierMaisForte]) {
      anomalias.push({
        tipo: "tier-arma-fora-de-ordem",
        detalhe: `Tier ${tierMaisFraco} (dano médio ${items.mediaDanoArmaPorTier[tierMaisFraco]}) supera Tier ${tierMaisForte} (${items.mediaDanoArmaPorTier[tierMaisForte]})`,
      });
    }
  }

  // 2) Habilidade de cooldown 0 com dano_base muito acima da mediana das
  // ativas — heurística simples (não é um resultado de simulação), só
  // pra apontar candidatas a revisão manual.
  const ativasComDano = abilities.linhas.filter((p) => p.tipo_poder === "Ativo" && p.dano_base > 0);
  if (ativasComDano.length > 0) {
    const ordenado = [...ativasComDano].sort((a, b) => a.dano_base - b.dano_base);
    const mediana = ordenado[Math.floor(ordenado.length / 2)].dano_base;
    for (const power of ativasComDano) {
      if ((power.cooldown ?? 0) === 0 && power.dano_base > mediana * 2) {
        anomalias.push({
          tipo: "cooldown-zero-dano-alto",
          detalhe: `Power "${power.nome}" (id ${power.id}) tem cooldown 0 e dano_base ${power.dano_base}, mais que o dobro da mediana das ativas (${mediana}) — candidata a ter cooldown revisado.`,
        });
      }
    }
  }

  return anomalias;
}

async function main() {
  await sequelize.authenticate();
  console.log("[audit] Conectado — rodando SOMENTE LEITURA, nada será escrito no banco.");

  const items = await auditarItems();
  salvar("items", items);

  const abilities = await auditarAbilities();
  salvar("abilities", abilities);

  const statusEffects = abilities.linhas.flatMap((p) =>
    p.efeitosDeStatus.map((e) => ({ id_power: p.id, power: p.nome, ...e })),
  );
  salvar("status-effects", statusEffects);

  const benchmarks = auditarBenchmarks();
  salvar("benchmarks", benchmarks);

  const anomalias = await detectarAnomalias({ items, abilities });
  salvar(
    "anomalies",
    {
      encontradas: anomalias,
      naoAutomatizado: [
        "Piso do refinamento (+N por propriedade) vs curva percentual nominal (§51) — precisa ler forgeRefinementService a fundo antes de decidir um cálculo confiável.",
        "Uptime de Silence/hard-control (§71) — precisa do simulador turno a turno (scripts/simulate-balance.js, não construído).",
        "Proc de item gerando mais DPS que a própria arma (§71) — ItemCombatEffect é Fase 7, ainda não implementada.",
        "Monstro raro menos ameaçador que comum da mesma faixa (§71) — precisa do Poder do monstro calculado por encontro real (calcularPoderMonstro já existe, mas isto requer rodar encontros de verdade ou o simulador).",
      ],
    },
  );

  console.log(`\n[audit] Concluído. ${anomalias.length} anomalia(s) automatizada(s) encontrada(s). Saída em ${DIR_SAIDA}`);
  await sequelize.close();
}

main().catch((error) => {
  console.error("[audit] Falhou:", error);
  process.exit(1);
});
