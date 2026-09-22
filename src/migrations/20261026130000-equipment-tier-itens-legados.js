"use strict";

// Reestruturação de Tier de Equipamentos — passo 3/3 (spec §23):
// "Existem itens legados como Espada de Ferro/Elmo de Ferro criados
// por seed antigo. Eles também precisam receber Tier quando forem
// equipáveis. Criar uma tabela explícita de migração por ID/nome para
// esses casos, em vez de inferir Tier por texto de forma permanente."
//
// "Espada de Ferro"/"Peitoral de Ferro"/"Anel de Ferro" citados na
// spec são na verdade nomes de ForgeBlueprint (não de Item — seus
// Items resultantes se chamam "Espada Forjada de Ferro — <qualidade>"
// etc, já cobertos na migration anterior). Os itens VERDADEIRAMENTE
// legados (fora do sistema de Forja de 8 minérios, sem blueprint por
// trás) são as linhas de progressão abaixo — mapeados explicitamente
// por NOME, na mesma escala Raridade->Tier usada como proxy de "estágio
// da linha" (Comum/Incomum/Raro/Epico/Lendario/Mitico -> V/IV/III/II/I/I),
// já que não pertencem a nenhuma receita/mineral de Forja de onde
// derivar Tier de outro jeito.
const TIER_POR_RARIDADE_LEGADO = { Comum: 5, Incomum: 4, Raro: 3, Epico: 2, Lendario: 1, Mitico: 1 };

// Tabela explícita nome -> linha de origem, só pra documentar a
// decisão no relatório final (spec §49) — o Tier de cada um vem da
// própria raridade já cadastrada (TIER_POR_RARIDADE_LEGADO acima), não
// de um valor hardcoded por nome, mas a lista serve de auditoria: todo
// nome abaixo foi conferido manualmente antes desta migration.
const NOMES_LEGADOS_CONFERIDOS = [
  // Set Sombrio (20260924010000) — todos Épico fixo, sem variação de raridade.
  "Elmo Sombrio", "Peitoral Sombrio", "Manoplas Sombrias", "Botas Sombrias",
  // Anéis/Colares (20260930030000, substituíram Cintos/Medalhões já removidos do banco).
  "Anel de Couro", "Anel Cravejado", "Anel Flamejante", "Anel do Rei Dracônico",
  "Colar de Cobre", "Colar do Guardião", "Colar em Chamas", "Colar do Cristal Eterno",
  // Capuzes/Vestes arcanas (20260930120000) — linha Comum..Lendario.
  "Capuz de Aprendiz", "Capuz Arcano", "Capuz do Adepto", "Capuz das Sombras", "Capuz Celestial",
  "Vestes de Aprendiz", "Vestes Arcanas", "Vestes do Adepto", "Vestes das Sombras", "Vestes Celestiais",
  // Botas arcanas (20260930170000) — linha Comum..Lendario.
  "Botas de Aprendiz", "Botas Arcanas", "Botas do Adepto", "Botas das Sombras", "Botas Celestiais",
];

const TIPOS_EQUIPAVEIS = ["Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2"];

module.exports = {
  async up(queryInterface) {
    let atualizadosPorNome = 0;
    for (const nome of NOMES_LEGADOS_CONFERIDOS) {
      const [[item]] = await queryInterface.sequelize.query(
        `SELECT id, raridade, tier_equipamento FROM "Items" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      if (!item) {
        console.log(`[migration] Item legado "${nome}" não encontrado (pode já ter sido removido/renomeado) — pulando.`);
        continue;
      }
      const tier = TIER_POR_RARIDADE_LEGADO[item.raridade];
      if (!tier) {
        console.log(`[migration] Item "${nome}" com raridade "${item.raridade}" sem Tier mapeado — pulando (revisar manualmente).`);
        continue;
      }
      if (item.tier_equipamento !== tier) {
        await queryInterface.sequelize.query(`UPDATE "Items" SET tier_equipamento = :tier WHERE id = :id;`, {
          replacements: { tier, id: item.id },
        });
        atualizadosPorNome += 1;
      }
    }

    // Rede de segurança: qualquer OUTRO item equipável que tenha ficado
    // sem Tier (fora da lista auditada acima — ex.: criado por um
    // script/seed que este levantamento não cobriu) recebe Tier pela
    // própria Raridade, na mesma escala — nunca fica null (spec §17
    // exige Tier em todo equipável), mas fica logado pra revisão manual
    // em vez de silencioso.
    const [orfaos] = await queryInterface.sequelize.query(
      `SELECT id, nome, raridade FROM "Items" WHERE tipo_item IN (:tipos) AND tier_equipamento IS NULL;`,
      { replacements: { tipos: TIPOS_EQUIPAVEIS } },
    );
    let atualizadosPorRedeDeSeguranca = 0;
    for (const item of orfaos) {
      const tier = TIER_POR_RARIDADE_LEGADO[item.raridade] ?? 5;
      await queryInterface.sequelize.query(`UPDATE "Items" SET tier_equipamento = :tier WHERE id = :id;`, {
        replacements: { tier, id: item.id },
      });
      console.log(`[migration] REDE DE SEGURANÇA: "${item.nome}" (id ${item.id}, ${item.raridade}) não estava na lista auditada — Tier ${tier} atribuído pela raridade. Revisar manualmente.`);
      atualizadosPorRedeDeSeguranca += 1;
    }

    console.log(
      `[migration] ${atualizadosPorNome} itens legados auditados receberam Tier; ${atualizadosPorRedeDeSeguranca} não previstos receberam Tier pela rede de segurança.`,
    );
  },

  async down(queryInterface) {
    const todosOsNomes = [...NOMES_LEGADOS_CONFERIDOS];
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET tier_equipamento = NULL WHERE nome IN (:nomes);`,
      { replacements: { nomes: todosOsNomes } },
    );
    // A rede de segurança não é revertida individualmente (não guardamos
    // quais IDs ela tocou) — reverter tier_equipamento de itens fora da
    // lista auditada exigiria os IDs exatos, não recuperáveis aqui sem
    // rodar a mesma query de novo. Aceitável: down() desta migration é
    // só pra reverter o rebalanceamento intencional, não uma auditoria
    // fora do escopo original.
  },
};
