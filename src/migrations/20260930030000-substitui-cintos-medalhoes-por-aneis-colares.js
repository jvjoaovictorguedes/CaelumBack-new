"use strict";

// Os cintos/medalhões inseridos em 20260929020000 tinham ícones craftpix
// genéricos. Chegaram artes customizadas melhores pra esses slots, mas só
// em 4 variações visuais (não 5), então em vez de mudar só o ícone os
// itens viram Anel (Acessorio1) e Colar (Acessorio2) — mesmo papel, mesma
// escala de bônus/preço, 4 raridades em vez de 5 (Comum/Incomum/Epico/
// Lendario, sem Raro).
//
// Cintos/medalhões já estavam no pool de drop (dropService.TIPOS_DROPAVEIS)
// desde o commit anterior, então algum personagem pode já ter um no
// inventário ou equipado. Por segurança, antes de apagar os itens antigos:
// 1) equipamento (character_equipment) é trocado pelo novo item equivalente;
// 2) inventário (character_inventory) é trocado pelo novo item equivalente
//    (Raro sobe pra Epico, já que não existe Raro no novo conjunto);
// 3) só então ArmorProperties e Items antigos são removidos.
module.exports = {
  async up(queryInterface) {
    const novos = [
      {
        nome: "Anel de Couro",
        descricao: "Trançado à mão, ainda cheira a couro cru — o primeiro anel de quem começa a lutar.",
        tipo_item: "Acessorio1",
        raridade: "Comum",
        valor_compra: 30,
        valor_venda: 10,
        peso: 0.1,
        disponivel_loja: true,
        imagem_url: "/icons/rings/anel-comum.png",
        propriedades: { bonus_forca: 2 },
      },
      {
        nome: "Anel Cravejado",
        descricao: "Rebites de metal embutidos no aro — segura a força de quem já apanhou (e revidou).",
        tipo_item: "Acessorio1",
        raridade: "Incomum",
        valor_compra: 80,
        valor_venda: 27,
        peso: 0.1,
        disponivel_loja: true,
        imagem_url: "/icons/rings/anel-incomum.png",
        propriedades: { bonus_forca: 3, bonus_vitalidade: 1 },
      },
      {
        nome: "Anel Flamejante",
        descricao: "Nunca esfria de verdade — o calor sobe pelo braço antes de cada golpe.",
        tipo_item: "Acessorio1",
        raridade: "Epico",
        valor_compra: 0,
        valor_venda: 160,
        peso: 0.1,
        disponivel_loja: false,
        imagem_url: "/icons/rings/anel-epico.png",
        propriedades: { bonus_forca: 5, bonus_agilidade: 4 },
      },
      {
        nome: "Anel do Rei Dracônico",
        descricao: "Prata e safira que já pertenceram a um rei que caiu lutando contra um dragão.",
        tipo_item: "Acessorio1",
        raridade: "Lendario",
        valor_compra: 0,
        valor_venda: 210,
        peso: 0.1,
        disponivel_loja: false,
        imagem_url: "/icons/rings/anel-lendario.png",
        propriedades: { bonus_forca: 8, bonus_vitalidade: 6 },
      },
      {
        nome: "Colar de Cobre",
        descricao: "Um pingente simples, mas já responde de leve ao chamado da magia.",
        tipo_item: "Acessorio2",
        raridade: "Comum",
        valor_compra: 30,
        valor_venda: 10,
        peso: 0.2,
        disponivel_loja: true,
        imagem_url: "/icons/necklaces/colar-comum.png",
        propriedades: { bonus_inteligencia: 2 },
      },
      {
        nome: "Colar do Guardião",
        descricao: "Um brasão pendurado no peito — protege tanto quanto inspira.",
        tipo_item: "Acessorio2",
        raridade: "Incomum",
        valor_compra: 80,
        valor_venda: 27,
        peso: 0.2,
        disponivel_loja: true,
        imagem_url: "/icons/necklaces/colar-incomum.png",
        propriedades: { bonus_inteligencia: 3, bonus_velocidade: 1 },
      },
      {
        nome: "Colar em Chamas",
        descricao: "Pulsa como um coração ardente — quem usa nunca fica realmente frio.",
        tipo_item: "Acessorio2",
        raridade: "Epico",
        valor_compra: 0,
        valor_venda: 160,
        peso: 0.2,
        disponivel_loja: false,
        imagem_url: "/icons/necklaces/colar-epico.png",
        propriedades: { bonus_inteligencia: 5, bonus_velocidade: 4 },
      },
      {
        nome: "Colar do Cristal Eterno",
        descricao: "Um fragmento de gelo que nunca derrete, preso numa corrente de prata antiga.",
        tipo_item: "Acessorio2",
        raridade: "Lendario",
        valor_compra: 0,
        valor_venda: 210,
        peso: 0.2,
        disponivel_loja: false,
        imagem_url: "/icons/necklaces/colar-lendario.png",
        propriedades: { bonus_inteligencia: 8, bonus_velocidade: 6 },
      },
    ];

    const idsNovos = {};
    for (const item of novos) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: item.nome } },
      );
      let idItem;
      if (existente.length > 0) {
        idItem = existente[0].id;
        console.log(`[migration] Item "${item.nome}" já existe — pulando criação.`);
      } else {
        const [linhas] = await queryInterface.sequelize.query(
          `INSERT INTO "Items"
             (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, disponivel_loja, imagem_url, "createdAt", "updatedAt")
           VALUES
             (:nome, :descricao, :tipo_item, :raridade, :valor_compra, :valor_venda, :peso, :disponivel_loja, :imagem_url, now(), now())
           RETURNING id;`,
          { replacements: item },
        );
        idItem = linhas[0].id;

        const p = item.propriedades;
        await queryInterface.sequelize.query(
          `INSERT INTO "ArmorProperties"
             (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_agilidade, bonus_inteligencia, bonus_velocidade, "createdAt", "updatedAt")
           VALUES
             (:id_item, :slot, 0, :forca, :vitalidade, :agilidade, :inteligencia, :velocidade, now(), now());`,
          {
            replacements: {
              id_item: idItem,
              slot: item.tipo_item,
              forca: p.bonus_forca ?? 0,
              vitalidade: p.bonus_vitalidade ?? 0,
              agilidade: p.bonus_agilidade ?? 0,
              inteligencia: p.bonus_inteligencia ?? 0,
              velocidade: p.bonus_velocidade ?? 0,
            },
          },
        );
      }
      idsNovos[`${item.tipo_item}:${item.raridade}`] = idItem;
    }

    // Raro sobe pra Epico — não existe tier Raro no novo conjunto.
    const mapaSubstituicao = {
      "Cinto de Couro": idsNovos["Acessorio1:Comum"],
      "Cinto Reforçado": idsNovos["Acessorio1:Incomum"],
      "Cinto do Caçador": idsNovos["Acessorio1:Epico"],
      "Cinto Sombrio": idsNovos["Acessorio1:Epico"],
      "Cinto Dracônico": idsNovos["Acessorio1:Lendario"],
      "Medalhão de Cobre": idsNovos["Acessorio2:Comum"],
      "Medalhão de Prata": idsNovos["Acessorio2:Incomum"],
      "Medalhão Élfico": idsNovos["Acessorio2:Epico"],
      "Medalhão Sombrio": idsNovos["Acessorio2:Epico"],
      "Medalhão Dracônico": idsNovos["Acessorio2:Lendario"],
    };

    for (const [nomeAntigo, idNovo] of Object.entries(mapaSubstituicao)) {
      const [antigos] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeAntigo } },
      );
      if (antigos.length === 0) continue;
      const idAntigo = antigos[0].id;

      // Compensa quem já equipou ou carrega o item antigo, trocando pelo
      // equivalente novo, antes de apagar o item antigo.
      await queryInterface.sequelize.query(
        `UPDATE character_equipment SET id_item = :idNovo WHERE id_item = :idAntigo;`,
        { replacements: { idNovo, idAntigo } },
      );
      await queryInterface.sequelize.query(
        `UPDATE character_inventory SET id_item = :idNovo WHERE id_item = :idAntigo;`,
        { replacements: { idNovo, idAntigo } },
      );

      await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item = :idAntigo;`, {
        replacements: { idAntigo },
      });
      await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id = :idAntigo;`, {
        replacements: { idAntigo },
      });
      console.log(`[migration] "${nomeAntigo}" (id ${idAntigo}) substituído e removido.`);
    }
  },

  async down() {},
};
