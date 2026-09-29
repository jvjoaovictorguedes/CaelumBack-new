// Aplica um "pacote de recompensa" (ouro/xp/itens) a um personagem —
// extraído de adminGrantService.grantToCharacter pra ser reaproveitado
// por qualquer fonte de recompensa que não seja uma concessão manual de
// admin (ex.: código de resgate) sem duplicar a lógica de
// instanciável-vs-empilhável nem reinventar a mesma conta. Quem chama
// decide a própria auditoria/validação de contexto (motivo, permissão
// etc.) — esta função só aplica o que já foi validado.
const Character = require("../models/Character");
const Item = require("../models/Item");
const { concederOuro } = require("./goldService");
const { adicionarExperiencia } = require("./experienceService");
const { addStack } = require("./inventoryService");
const { ehInstanciavel, create: criarInstanciaEquipamento } = require("./equipmentInstanceService");

// bundle: { ouro?: number, xp?: number, itens?: { id_item, quantidade, raridade?, refinamento? }[] }
async function aplicarPacoteDeRecompensa(idPersonagem, bundle, transaction) {
  const character = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
  if (!character) throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });

  const concedido = { ouro: 0, xp: 0, niveisGanhos: 0, itens: [], equipamentos: [] };

  if (bundle.ouro != null) {
    concederOuro(character, bundle.ouro);
    concedido.ouro = bundle.ouro;
  }

  for (const linha of bundle.itens ?? []) {
    const item = await Item.findByPk(linha.id_item, { transaction });
    if (!item) throw Object.assign(new Error(`Item #${linha.id_item} não encontrado.`), { statusCode: 400 });
    if (ehInstanciavel(item.tipo_item)) {
      const raridade = linha.raridade ?? item.raridade;
      for (let i = 0; i < linha.quantidade; i++) {
        await criarInstanciaEquipamento(
          { idPersonagem, idItem: item.id, raridade, refinamento: linha.refinamento ?? 0 },
          transaction,
        );
      }
      concedido.equipamentos.push({ id_item: item.id, nome: item.nome, raridade, quantidade: linha.quantidade });
    } else {
      await addStack(idPersonagem, item.id, linha.quantidade, transaction);
      concedido.itens.push({ id_item: item.id, nome: item.nome, quantidade: linha.quantidade });
    }
  }

  await character.save({ transaction });

  // adicionarExperiencia já salva o character sozinha (inclusive
  // recalculando vida/mana no level up) — roda por último, depois do
  // save acima, pra não sobrescrever o ouro concedido com um character
  // desatualizado.
  if (bundle.xp != null) {
    const resultado = await adicionarExperiencia(idPersonagem, bundle.xp, { transaction, personagem: character });
    concedido.xp = bundle.xp;
    concedido.niveisGanhos = resultado.niveisGanhos;
  }

  return { character, concedido };
}

module.exports = { aplicarPacoteDeRecompensa };
