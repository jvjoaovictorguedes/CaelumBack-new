// scripts/seed-equipamentos-producao.js
//
// Popula uma gama de armas e armaduras em 6 raridades (Comum até
// Mítico), com progressão temática de material (madeira -> bronze ->
// aço -> mithril -> dracônico -> artefato mítico). Feito pra rodar
// direto contra o banco de PRODUÇÃO, então:
//
//   - É idempotente: usa findOrCreate pelo "nome" (que já é UNIQUE na
//     tabela Items), então rodar de novo não duplica nada nem sobe por
//     cima de itens que você já tenha criado manualmente.
//   - Nunca toca em ids específicos — só cria itens novos com nomes
//     próprios, então não corre risco de mexer no que você já ajustou
//     (ex: a Espada de Ferro que você editou).
//
// Como rodar (mesma ideia de "railway run npm run migrate" que você já
// usa):
//   railway run node scripts/seed-equipamentos-producao.js
// ou, se preferir rodar local apontando pra produção, exporte
// DATABASE_URL com a connection string de produção antes:
//   DATABASE_URL="postgres://...” node scripts/seed-equipamentos-producao.js

const Item = require("../src/models/Item");
const WeaponProperties = require("../src/models/WeaponProperties");
const ArmorProperties = require("../src/models/ArmorProperties");
const { sequelize } = require("../src/config/database");

// Progressão por raridade. dano/defesa/bonus escalam junto; valor_compra
// também, pra loja/drops fazerem sentido econômico.
const TIERS = [
  { raridade: "Comum", sufixo: "de Madeira", danoMin: 4, danoMax: 8, bonus: 1, defesa: 3, precoArma: 15, precoArmadura: 12 },
  { raridade: "Incomum", sufixo: "de Bronze", danoMin: 8, danoMax: 14, bonus: 2, defesa: 6, precoArma: 40, precoArmadura: 30 },
  { raridade: "Raro", sufixo: "de Aço", danoMin: 14, danoMax: 22, bonus: 4, defesa: 10, precoArma: 100, precoArmadura: 80 },
  { raridade: "Epico", sufixo: "de Mithril", danoMin: 22, danoMax: 32, bonus: 6, defesa: 16, precoArma: 250, precoArmadura: 200 },
  { raridade: "Lendario", sufixo: "Dracônico(a)", danoMin: 32, danoMax: 45, bonus: 9, defesa: 24, precoArma: 600, precoArmadura: 500 },
  { raridade: "Mitico", sufixo: "Celestial de Caelum", danoMin: 45, danoMax: 60, bonus: 13, defesa: 34, precoArma: 1500, precoArmadura: 1200 },
];

// index do array TIERS até onde cada linha de arma/armadura vai.
const ATE_MITICO = 6;
const ATE_LENDARIO = 5;
const ATE_EPICO = 4;
const ATE_RARO = 3;
const ATE_INCOMUM = 2;

function descricaoArma(nomeBase, tier) {
  return `${nomeBase} ${tier.sufixo}. Qualidade ${tier.raridade.toLowerCase()} — causa entre ${tier.danoMin} e ${tier.danoMax} de dano.`;
}

function descricaoArmadura(nomeBase, tier) {
  return `${nomeBase} ${tier.sufixo}. Qualidade ${tier.raridade.toLowerCase()} — oferece ${tier.defesa} de defesa.`;
}

// Cada "linha" de arma tem um nome base, tipo de arma, tipo de dano e o
// atributo que ela bonifica, e roda por um número de tiers (algumas só
// até um ponto, pra dar variedade sem virar uma tabela gigante).
const LINHAS_DE_ARMA = [
  { nomeBase: "Espada", tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca", ateTier: ATE_MITICO },
  { nomeBase: "Cajado", tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia", ateTier: ATE_MITICO },
  { nomeBase: "Machado", tipo_arma: "Machado", tipo_dano: "Fisico", bonus_atributo: "Forca", ateTier: ATE_INCOMUM },
  { nomeBase: "Adaga", tipo_arma: "Adaga", tipo_dano: "Fisico", bonus_atributo: "Agilidade", ateTier: ATE_RARO },
  { nomeBase: "Lança", tipo_arma: "Lança", tipo_dano: "Fisico", bonus_atributo: "Forca", ateTier: ATE_RARO },
  { nomeBase: "Orbe", tipo_arma: "Orbe", tipo_dano: "Magico", bonus_atributo: "Inteligencia", ateTier: ATE_RARO },
];

// Cada "linha" de armadura: slot, tipo_item aceito por aquele slot
// (ver CharacterEquipmentController.validarCompatibilidade) e como o
// bônus da peça se distribui entre atributos (soma sempre bate com
// tier.bonus, só pra dar uma cara própria pra cada peça).
const LINHAS_DE_ARMADURA = [
  {
    nomeBase: "Elmo",
    slot: "Cabeca",
    tipo_item: "Capacete",
    ateTier: ATE_MITICO,
    distribuir: (bonus) => ({
      bonus_vitalidade: Math.round(bonus * 0.7),
      bonus_inteligencia: Math.round(bonus * 0.3),
    }),
  },
  {
    nomeBase: "Peitoral",
    slot: "Torso",
    tipo_item: "Armadura",
    ateTier: ATE_MITICO,
    distribuir: (bonus) => ({ bonus_vitalidade: bonus }),
  },
  {
    nomeBase: "Escudo",
    slot: "Maos",
    tipo_item: "Escudo",
    ateTier: ATE_EPICO,
    distribuir: (bonus) => ({
      bonus_vitalidade: Math.round(bonus * 0.7),
      bonus_forca: Math.round(bonus * 0.3),
    }),
  },
  {
    nomeBase: "Botas",
    slot: "Pes",
    tipo_item: "Armadura",
    ateTier: ATE_EPICO,
    distribuir: (bonus) => ({
      bonus_vitalidade: Math.round(bonus * 0.4),
      bonus_velocidade: Math.round(bonus * 0.6),
    }),
  },
];

async function criarArma(linha, tier) {
  const nome = `${linha.nomeBase} ${tier.sufixo}`;
  const [item, criado] = await Item.findOrCreate({
    where: { nome },
    defaults: {
      nome,
      descricao: descricaoArma(linha.nomeBase, tier),
      tipo_item: "Arma",
      raridade: tier.raridade,
      valor_compra: tier.precoArma,
      valor_venda: Math.round(tier.precoArma * 0.4),
      peso: 3,
    },
  });

  await WeaponProperties.findOrCreate({
    where: { id_item: item.id },
    defaults: {
      id_item: item.id,
      dano_min: tier.danoMin,
      dano_max: tier.danoMax,
      tipo_dano: linha.tipo_dano,
      tipo_arma: linha.tipo_arma,
      bonus_atributo: linha.bonus_atributo,
      valor_bonus_atributo: tier.bonus,
    },
  });

  return { nome, criado };
}

async function criarArmadura(linha, tier) {
  const nome = `${linha.nomeBase} ${tier.sufixo}`;
  const [item, criado] = await Item.findOrCreate({
    where: { nome },
    defaults: {
      nome,
      descricao: descricaoArmadura(linha.nomeBase, tier),
      tipo_item: linha.tipo_item,
      raridade: tier.raridade,
      valor_compra: tier.precoArmadura,
      valor_venda: Math.round(tier.precoArmadura * 0.4),
      peso: 2,
    },
  });

  const distribuido = linha.distribuir(tier.bonus);

  await ArmorProperties.findOrCreate({
    where: { id_item: item.id },
    defaults: {
      id_item: item.id,
      slot_equipamento: linha.slot,
      defesa: tier.defesa,
      bonus_forca: distribuido.bonus_forca || 0,
      bonus_vitalidade: distribuido.bonus_vitalidade || 0,
      bonus_inteligencia: distribuido.bonus_inteligencia || 0,
      bonus_agilidade: distribuido.bonus_agilidade || 0,
      bonus_velocidade: distribuido.bonus_velocidade || 0,
    },
  });

  return { nome, criado };
}

// Se algum item já foi inserido com um id fixo na mão (ex: um seed ou
// um INSERT manual direto no banco), a sequence de auto-incremento do
// Postgres pode ter ficado pra trás do maior id que já existe — aí o
// próximo INSERT sem id explícito tenta reusar um id já ocupado e
// quebra com "unique violation". Sincroniza antes de criar qualquer
// coisa, só por segurança (não faz mal nenhum se já estiver certa).
async function sincronizarSequenceDeItems() {
  await sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"Items"', 'id'), COALESCE((SELECT MAX(id) FROM "Items"), 1))`,
  );
}

async function main() {
  await sequelize.authenticate();
  await sincronizarSequenceDeItems();
  console.log("Conectado ao banco. Criando equipamentos...\n");

  let novos = 0;
  let existentes = 0;

  for (const linha of LINHAS_DE_ARMA) {
    for (const tier of TIERS.slice(0, linha.ateTier)) {
      const { nome, criado } = await criarArma(linha, tier);
      console.log(`${criado ? "[novo]" : "[já existia]"} ${nome}`);
      criado ? novos++ : existentes++;
    }
  }

  for (const linha of LINHAS_DE_ARMADURA) {
    for (const tier of TIERS.slice(0, linha.ateTier)) {
      const { nome, criado } = await criarArmadura(linha, tier);
      console.log(`${criado ? "[novo]" : "[já existia]"} ${nome}`);
      criado ? novos++ : existentes++;
    }
  }

  console.log(`\nPronto! ${novos} itens novos criados, ${existentes} já existiam (nenhum foi alterado).`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Erro ao popular equipamentos:", error);
  process.exit(1);
});
