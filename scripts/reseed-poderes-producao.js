// scripts/reseed-poderes-producao.js
//
// Reset completo do catálogo de Poderes — DIFERENTE de uma migration:
// migrations rodam uma vez e ficam "concluídas" pra sempre (ver
// scripts/seed-*-producao.js pro padrão idempotente de findOrCreate).
// Este script é pra ser rodado toda vez que você quiser REDESENHAR o
// catálogo inteiro de poderes do zero — apaga tudo (Powers e os
// vínculos com classe/raça/personagem) e recria a partir da lista
// abaixo. Rodar de novo sempre limpa e regenera de novo, não importa
// quantas vezes já rodou antes.
//
// O que acontece com quem já tem personagem: CharacterAbilities
// (poderes já aprendidos) é limpo junto — não tem como manter vínculo
// com um Power que não existe mais. Isso é seguro: o próprio jogo
// reconcede automaticamente os poderes certos (pro nível/classe/raça de
// cada personagem) na próxima vez que a tela de personagem, aventura
// etc. carregar (ver concederPoderesIniciais em characterController.js).
// Só um efeito colateral: qualquer poder que o jogador tivesse
// desativado manualmente (toggleCharacterAbility) volta a ficar ativo
// por padrão.
//
// Como rodar: railway run node scripts/reseed-poderes-producao.js

const Power = require("../src/models/Power");
const Class = require("../src/models/Class");
const Race = require("../src/models/Race");
const ClassAbilities = require("../src/models/ClassAbilities");
const RaceAbilities = require("../src/models/RaceAbilities");
const { sequelize } = require("../src/config/database");

// ---------------------------------------------------------------------
// Catálogo de poderes por classe — cada classe tem uma curva de 5-6
// poderes que vão ficando mais fortes (e mais caros de mana) conforme o
// nível sobe, pra não deixar o jogo fácil demais logo cedo: os
// primeiros poderes são fracos de propósito, os de nível alto exigem o
// personagem já ter investido bastante (nível + atributos) pra valer a
// pena usar.
// ---------------------------------------------------------------------
const PODERES_POR_CLASSE = {
  Guerreiro: [
    {
      nome: "Golpe Poderoso",
      descricao: "Um golpe que usa toda a força do herói.",
      tipo_poder: "Ativo",
      custo_mana: 0,
      dano_base: 10,
      escala_atributo: "Forca",
      valor_escala: 1.2,
      nivel_aprendizagem: 1,
      imagem_url: "/icons/skills/golpe-poderoso.png",
    },
    {
      nome: "Investida Brutal",
      descricao: "Avança contra o inimigo com o peso do corpo inteiro, ignorando a própria guarda.",
      tipo_poder: "Ativo",
      custo_mana: 6,
      dano_base: 15,
      escala_atributo: "Forca",
      valor_escala: 1.25,
      nivel_aprendizagem: 5,
      imagem_url: "/icons/skills/investida-brutal.png",
    },
    {
      nome: "Fúria de Aço",
      descricao: "Uma sequência de golpes cada vez mais violentos, alimentada pela raiva do combate.",
      tipo_poder: "Ativo",
      custo_mana: 12,
      dano_base: 24,
      escala_atributo: "Forca",
      valor_escala: 1.35,
      nivel_aprendizagem: 12,
      imagem_url: "/icons/skills/furia-de-aco.png",
    },
    {
      nome: "Brado de Guerra",
      descricao: "Um grito que desperta a vontade de continuar lutando, recuperando vigor no meio da batalha.",
      tipo_poder: "Ativo",
      custo_mana: 10,
      cura_base: 22,
      escala_atributo: "Vitalidade",
      valor_escala: 1.0,
      nivel_aprendizagem: 20,
      imagem_url: "/icons/skills/brado-de-guerra.png",
    },
    {
      nome: "Golpe Sísmico",
      descricao: "Um golpe devastador contra o chão que ecoa através do inimigo inteiro.",
      tipo_poder: "Ativo",
      custo_mana: 20,
      dano_base: 38,
      escala_atributo: "Forca",
      valor_escala: 1.55,
      nivel_aprendizagem: 30,
      imagem_url: "/icons/skills/golpe-sismico.png",
    },
  ],
  Mago: [
    {
      nome: "Cura Arcana",
      descricao: "Recupera vida usando energia mágica.",
      tipo_poder: "Ativo",
      custo_mana: 12,
      cura_base: 15,
      escala_atributo: "Inteligencia",
      valor_escala: 1.0,
      nivel_aprendizagem: 1,
    },
    {
      nome: "Bola de Fogo",
      descricao: "Uma explosão de energia arcana lançada contra o inimigo.",
      tipo_poder: "Ativo",
      custo_mana: 10,
      dano_base: 8,
      escala_atributo: "Inteligencia",
      valor_escala: 1.2,
      nivel_aprendizagem: 1,
    },
    {
      nome: "Lança de Gelo",
      descricao: "Uma lança de gelo puro, rápida o bastante pra atravessar qualquer guarda desprevenida.",
      tipo_poder: "Ativo",
      custo_mana: 16,
      dano_base: 17,
      escala_atributo: "Inteligencia",
      valor_escala: 1.3,
      nivel_aprendizagem: 8,
    },
    {
      nome: "Explosão Arcana",
      descricao: "Concentra energia arcana bruta até liberá-la de uma vez, sem piedade.",
      tipo_poder: "Ativo",
      custo_mana: 22,
      dano_base: 27,
      escala_atributo: "Inteligencia",
      valor_escala: 1.4,
      nivel_aprendizagem: 16,
    },
    {
      nome: "Renascer Místico",
      descricao: "Um ritual de cura profunda, capaz de reverter ferimentos graves em pleno combate.",
      tipo_poder: "Ativo",
      custo_mana: 28,
      cura_base: 38,
      escala_atributo: "Inteligencia",
      valor_escala: 1.15,
      nivel_aprendizagem: 24,
    },
    {
      nome: "Meteoro Arcano",
      descricao: "Invoca um fragmento de poder puro do céu — o ápice da destruição arcana.",
      tipo_poder: "Ativo",
      custo_mana: 38,
      dano_base: 52,
      escala_atributo: "Inteligencia",
      valor_escala: 1.6,
      nivel_aprendizagem: 35,
    },
  ],
};

// ---------------------------------------------------------------------
// Catálogo de poderes por raça — cada raça (mesmo as comuns, que antes
// não tinham NENHUM poder próprio) ganha um poder com a cara da sua
// identidade. Celestial, por ser a linhagem rara/lendária, ganha dois —
// um logo de cara e outro bem mais forte lá na frente, reforçando por
// que ela é tão rara.
// ---------------------------------------------------------------------
const PODERES_POR_RACA = {
  Humano: [
    {
      nome: "Vontade Inabalável",
      descricao: "A adaptabilidade humana em forma de resiliência — recupera-se onde outras raças cederiam.",
      tipo_poder: "Ativo",
      custo_mana: 10,
      cura_base: 18,
      escala_atributo: "Vitalidade",
      valor_escala: 1.0,
      nivel_aprendizado: 10,
    },
  ],
  Elfo: [
    {
      nome: "Flecha Élfica",
      descricao: "Um disparo preciso guiado por séculos de instinto élfico com a natureza.",
      tipo_poder: "Ativo",
      custo_mana: 8,
      dano_base: 14,
      escala_atributo: "Agilidade",
      valor_escala: 1.3,
      nivel_aprendizado: 8,
    },
  ],
  Anao: [
    {
      nome: "Fúria Anã",
      descricao: "A teimosia da rocha em forma de golpe — anões não recuam, nem quando deveriam.",
      tipo_poder: "Ativo",
      custo_mana: 6,
      dano_base: 16,
      escala_atributo: "Forca",
      valor_escala: 1.25,
      nivel_aprendizado: 8,
      imagem_url: "/icons/skills/furia-ana.png",
    },
  ],
  Orc: [
    {
      nome: "Fúria Selvagem",
      descricao: "Um ataque bruto sem nenhuma técnica além da vontade pura de vencer.",
      tipo_poder: "Ativo",
      custo_mana: 5,
      dano_base: 20,
      escala_atributo: "Forca",
      valor_escala: 1.35,
      nivel_aprendizado: 10,
      imagem_url: "/icons/skills/furia-selvagem.png",
    },
  ],
  Celestial: [
    {
      nome: "Julgamento Divino",
      descricao: "Poder exclusivo da linhagem Celestial, invoca luz pura contra o inimigo.",
      tipo_poder: "Ativo",
      custo_mana: 15,
      dano_base: 18,
      escala_atributo: "Inteligencia",
      valor_escala: 1.5,
      nivel_aprendizado: 1,
    },
    {
      nome: "Luz Purificadora",
      descricao: "Quando um Celestial atinge a maturidade de seu poder, nem as sombras mais densas resistem.",
      tipo_poder: "Ativo",
      custo_mana: 22,
      dano_base: 34,
      escala_atributo: "Inteligencia",
      valor_escala: 1.6,
      nivel_aprendizado: 20,
    },
  ],
};

async function limparTudo(transaction) {
  // Ordem importa por causa das foreign keys — sempre limpa quem
  // REFERENCIA Powers antes de limpar Powers em si.
  await sequelize.query('DELETE FROM "CharacterAbilities";', { transaction });
  await sequelize.query('DELETE FROM class_abilities;', { transaction });
  await sequelize.query('DELETE FROM "RaceAbilities";', { transaction });
  // Evoluções que concediam poder ficam sem poder associado, em vez de
  // impedir a limpeza — evolutions.id_power_concedido é opcional.
  await sequelize.query(
    'UPDATE evolutions SET id_power_concedido = NULL WHERE id_power_concedido IS NOT NULL;',
    { transaction },
  );

  // O delete sem WHERE que foi pedido — limpa o catálogo inteiro.
  await sequelize.query('DELETE FROM "Powers";', { transaction });

  // Reinicia o auto-incremento pra não deixar os ids cada vez mais
  // altos toda vez que este script rodar de novo.
  await sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"Powers"', 'id'), 1, false);`,
    { transaction },
  );
}

async function criarPoderesDeClasse(nomeClasse, poderes, transaction) {
  const classe = await Class.findOne({ where: { nome: nomeClasse }, transaction });
  if (!classe) {
    console.warn(`[aviso] Classe "${nomeClasse}" não encontrada — pulando os poderes dela.`);
    return 0;
  }

  let criados = 0;
  for (const { nivel_aprendizagem, ...dadosPoder } of poderes) {
    const poder = await Power.create(dadosPoder, { transaction });
    await ClassAbilities.create(
      { id_classe: classe.id, id_poder: poder.id, nivel_aprendizagem },
      { transaction },
    );
    console.log(`  [${nomeClasse}] nível ${nivel_aprendizagem}: ${poder.nome}`);
    criados += 1;
  }
  return criados;
}

async function criarPoderesDeRaca(nomeRaca, poderes, transaction) {
  const raca = await Race.findOne({
    where: { nome_masculino: nomeRaca },
    transaction,
  });
  if (!raca) {
    console.warn(`[aviso] Raça "${nomeRaca}" não encontrada — pulando os poderes dela.`);
    return 0;
  }

  let criados = 0;
  for (const { nivel_aprendizado, ...dadosPoder } of poderes) {
    const poder = await Power.create(dadosPoder, { transaction });
    await RaceAbilities.create(
      { id_raca: raca.id, id_power: poder.id, nivel_aprendizado },
      { transaction },
    );
    console.log(`  [${nomeRaca}] nível ${nivel_aprendizado}: ${poder.nome}`);
    criados += 1;
  }
  return criados;
}

async function main() {
  await sequelize.authenticate();
  console.log("Conectado ao banco.\n");

  let totalCriados = 0;

  await sequelize.transaction(async (transaction) => {
    console.log("Limpando catálogo de poderes (Powers, class_abilities, RaceAbilities, CharacterAbilities)...");
    await limparTudo(transaction);
    console.log("Catálogo limpo.\n");

    console.log("Criando poderes de classe:");
    for (const [nomeClasse, poderes] of Object.entries(PODERES_POR_CLASSE)) {
      totalCriados += await criarPoderesDeClasse(nomeClasse, poderes, transaction);
    }

    console.log("\nCriando poderes de raça:");
    for (const [nomeRaca, poderes] of Object.entries(PODERES_POR_RACA)) {
      totalCriados += await criarPoderesDeRaca(nomeRaca, poderes, transaction);
    }
  });

  console.log(`\nPronto! ${totalCriados} poderes criados.`);
  console.log(
    "Personagens já existentes recebem os poderes certos automaticamente na próxima vez que carregarem (tela de personagem, aventura etc.).",
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Erro ao regenerar poderes:", error);
  process.exit(1);
});
