// scripts/seed-poder-bola-de-fogo-producao.js
//
// Cria (se ainda não existir) o poder "Bola de Fogo" e o vincula à
// classe Mago — é o ajuste de poderes que fizemos essa sessão pra dar
// ao Mago um poder ofensivo de verdade (antes ele só tinha Cura Arcana,
// que cura, não ataca).
//
// Idempotente: usa findOrCreate pelo nome do poder (que já é UNIQUE) e
// pela combinação classe+poder, então rodar de novo não duplica nada.
// Não mexe em nenhum poder/classe que você já tenha configurado —
// só adiciona o que falta.
//
// Personagens já existentes NÃO precisam de nenhum passo extra depois
// desse script: a partir do commit "sincroniza poderes novos de
// classe/raça em personagens já existentes", o próprio jogo concede o
// poder automaticamente na próxima vez que o personagem for carregado
// (tela do personagem, aventura, etc).
//
// Como rodar: railway run node scripts/seed-poder-bola-de-fogo-producao.js

const { Op } = require("sequelize");
const Power = require("../src/models/Power");
const Class = require("../src/models/Class");
const ClassAbilities = require("../src/models/ClassAbilities");
const { sequelize } = require("../src/config/database");

// Se algum Power já foi inserido com id fixo na mão (é o caso do nosso
// seeder local, e pode ser o caso de inserts manuais em produção
// também), a sequence de auto-incremento do Postgres pode ter ficado
// pra trás do maior id existente — sincroniza antes de criar qualquer
// coisa, só por segurança.
async function sincronizarSequenceDePowers() {
  await sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"Powers"', 'id'), COALESCE((SELECT MAX(id) FROM "Powers"), 1))`,
  );
}

async function main() {
  await sequelize.authenticate();
  await sincronizarSequenceDePowers();
  console.log("Conectado ao banco.\n");

  const mago = await Class.findOne({ where: { nome: { [Op.iLike]: "%mago%" } } });
  if (!mago) {
    throw new Error(
      'Não encontrei nenhuma Classe com nome parecido com "Mago" — confira o nome exato e ajuste o script se for diferente.',
    );
  }
  console.log(`Classe encontrada: "${mago.nome}" (id ${mago.id})`);

  const [poder, poderCriado] = await Power.findOrCreate({
    where: { nome: "Bola de Fogo" },
    defaults: {
      nome: "Bola de Fogo",
      descricao: "Uma explosao de energia arcana lancada contra o inimigo.",
      tipo_poder: "Ativo",
      custo_mana: 10,
      dano_base: 6,
      cura_base: 0,
      escala_atributo: "Inteligencia",
      valor_escala: 1.2,
    },
  });
  console.log(`${poderCriado ? "[novo]" : "[já existia]"} Poder "Bola de Fogo" (id ${poder.id})`);

  const [, vinculoCriado] = await ClassAbilities.findOrCreate({
    where: { id_classe: mago.id, id_poder: poder.id },
    defaults: { id_classe: mago.id, id_poder: poder.id, nivel_aprendizagem: 1 },
  });
  console.log(
    `${vinculoCriado ? "[novo]" : "[já existia]"} Vínculo "${mago.nome}" aprende "Bola de Fogo" no nível 1`,
  );

  console.log("\nPronto! Personagens Mago já existentes ganham o poder automaticamente na próxima vez que entrarem no jogo.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Erro ao popular poder:", error);
  process.exit(1);
});
