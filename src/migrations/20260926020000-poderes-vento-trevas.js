"use strict";

// 4 poderes novos, concedidos pela árvore de Evolução de natureza
// mágica Ar/Escuridão (ver 20260926030000-evolucoes-ar-escuridao.js) —
// não entram em ClassAbilities porque são liberados só ao comprar a
// evolução do topo da árvore (id_power_concedido), não por nível de
// classe normal.
module.exports = {
  async up(queryInterface) {
    const poderes = [
      {
        nome: "Investida do Vendaval",
        descricao: "Avança envolto em vento cortante, rápido demais pra qualquer guarda acompanhar.",
        tipo_poder: "Ativo",
        custo_mana: 14,
        dano_base: 26,
        cura_base: 0,
        escala_atributo: "Agilidade",
        valor_escala: 1.4,
        imagem_url: "/icons/skills/investida-do-vendaval.png",
      },
      {
        nome: "Tornado Arcano",
        descricao: "Convoca um tornado de energia arcana que despedaça tudo ao redor do alvo.",
        tipo_poder: "Ativo",
        custo_mana: 24,
        dano_base: 30,
        cura_base: 0,
        escala_atributo: "Inteligencia",
        valor_escala: 1.45,
        imagem_url: "/icons/skills/tornado-arcano.png",
      },
      {
        nome: "Golpe das Sombras",
        descricao: "Um golpe que parece vir de todas as direções ao mesmo tempo, escondido na escuridão.",
        tipo_poder: "Ativo",
        custo_mana: 16,
        dano_base: 28,
        cura_base: 0,
        escala_atributo: "Forca",
        valor_escala: 1.4,
        imagem_url: "/icons/skills/golpe-das-sombras.png",
      },
      {
        nome: "Drenar Vida",
        descricao: "Arranca a força vital do inimigo e a devolve pra quem conjura — dano e cura no mesmo golpe.",
        tipo_poder: "Ativo",
        custo_mana: 20,
        dano_base: 20,
        cura_base: 15,
        escala_atributo: "Inteligencia",
        valor_escala: 1.1,
        imagem_url: "/icons/skills/drenar-vida.png",
      },
    ];

    const agora = new Date();
    for (const poder of poderes) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "Powers" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: poder.nome } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Poder "${poder.nome}" já existe — pulando.`);
        continue;
      }
      await queryInterface.bulkInsert("Powers", [
        { ...poder, createdAt: agora, updatedAt: agora },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Powers", {
      nome: ["Investida do Vendaval", "Tornado Arcano", "Golpe das Sombras", "Drenar Vida"],
    });
  },
};
