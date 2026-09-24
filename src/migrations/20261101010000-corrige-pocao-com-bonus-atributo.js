"use strict";

// Bug reportado: "Poção de Vida Pequena tá dando +2 Vitalidade e Poção de
// Vida Média 1.1 Força — isso não pode acontecer". Consumível de cura
// nunca deveria carregar efeito_atributo/valor_atributo — quem realmente
// aplica o item (characterInventoryController.useItem, combatController
// ação de item em combate) só lê efeito_vida/efeito_mana, então esses
// campos nunca fizeram efeito de verdade no jogo — só ficavam visíveis
// na tela como um bônus falso (foram preenchidos por engano em algum
// momento, provavelmente pelo formulário do Painel Administrativo, que
// deixa esses dois campos abertos pra qualquer Consumível sem
// distinguir "poção de cura" de "poção de buff").
//
// Zera efeito_atributo/valor_atributo em QUALQUER consumível que já
// tenha efeito_vida ou efeito_mana > 0 — os dois propósitos nunca devem
// se misturar num mesmo item. Idempotente (WHERE já filtra só o que
// precisa mudar).
module.exports = {
  async up(queryInterface) {
    const [afetados] = await queryInterface.sequelize.query(
      `UPDATE consumable_properties cp
       SET efeito_atributo = NULL, valor_atributo = 0
       FROM "Items" i
       WHERE cp.id_item = i.id
         AND (cp.efeito_vida > 0 OR cp.efeito_mana > 0)
         AND (cp.efeito_atributo IS NOT NULL OR cp.valor_atributo <> 0)
       RETURNING i.nome;`,
    );
    if (afetados.length > 0) {
      console.log(
        `[migration] Removido bônus de atributo indevido de ${afetados.length} poção(ões):`,
        afetados.map((a) => a.nome).join(", "),
      );
    } else {
      console.log("[migration] Nenhuma poção com bônus de atributo indevido encontrada.");
    }
  },

  async down() {
    console.log("[migration] down() é um no-op — não há como saber os valores incorretos originais pra restaurar.");
  },
};
