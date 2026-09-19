// Orquestrador da Forja v3 — progresso, leitura da fila (2 slots) e
// coleta. Fundição/Fabricação/Refinamento em si moram nos services
// dedicados (forgeSmeltingService/forgeCraftingService/
// forgeRefinementService); aqui só o que é comum aos três.
const { sequelize } = require("../config/database");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterForgeQueue = require("../models/CharacterForgeQueue");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const CharacterEquipment = require("../models/CharacterEquipment");
const Item = require("../models/Item");
const ArmorProperties = require("../models/ArmorProperties");
const { TIPOS_ACAO_FORJA } = require("../config/forgeConfig");
const { nivelPorXpTotal, xpParaProximoNivel, aplicarGanhoDeXp } = require("./forgeProgressionService");
const Character = require("../models/Character");
const { registrarProgresso } = require("./missionService");
const { registrarProgressoContrato } = require("./adventureGuildObjectiveService");

async function garantirProgresso(characterId, transaction) {
  const [progresso] = await CharacterForgeProgress.findOrCreate({
    where: { id_personagem: characterId },
    defaults: { id_personagem: characterId },
    transaction,
  });
  return progresso;
}

async function listarProgresso(characterId) {
  const progresso = await garantirProgresso(characterId);
  const nivel = nivelPorXpTotal(progresso.experiencia);
  return {
    nivel,
    experiencia: progresso.experiencia,
    xp_proximo_nivel: xpParaProximoNivel(nivel),
  };
}

function formatarEntradaFila(entrada) {
  if (!entrada) return null;
  const agora = Date.now();
  const prontoEm = new Date(entrada.pronto_em).getTime();
  return {
    id: entrada.id,
    slot: entrada.slot,
    tipo_acao: entrada.tipo_acao,
    referencia: entrada.referencia,
    iniciado_em: entrada.iniciado_em,
    pronto_em: entrada.pronto_em,
    segundos_restantes: Math.max(0, Math.ceil((prontoEm - agora) / 1000)),
    pronto: prontoEm <= agora,
  };
}

async function listarFila(characterId) {
  const entradas = await CharacterForgeQueue.findAll({ where: { id_personagem: characterId } });
  const porSlot = { Fundicao: null, Forja: null };
  for (const entrada of entradas) porSlot[entrada.slot] = formatarEntradaFila(entrada);
  return porSlot;
}

// Coleta o trabalho pronto de um slot ("Fundicao" nunca chega a ter fila
// hoje — ver forgeSmeltingService.js — mas o slot continua aceito aqui
// pra já existir pronto se isso mudar). Fabricação cria uma nova
// CharacterEquipmentInstance; Refinamento aplica (ou não, em caso de
// falha) o refinamento já sorteado na instância existente.
async function coletar(characterId, slot) {
  return sequelize.transaction(async (transaction) => {
    const entrada = await CharacterForgeQueue.findOne({
      where: { id_personagem: characterId, slot },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!entrada) throw Object.assign(new Error(`Nada em andamento no slot ${slot}.`), { statusCode: 400 });
    if (new Date(entrada.pronto_em).getTime() > Date.now()) {
      throw Object.assign(new Error("Esse trabalho ainda não terminou."), { statusCode: 400 });
    }

    const progresso = await CharacterForgeProgress.findOne({
      where: { id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    let resultado;

    if (entrada.tipo_acao === TIPOS_ACAO_FORJA.FABRICACAO) {
      const { id_item, qualidade_final } = entrada.payload_resultado;
      const instancia = await CharacterEquipmentInstance.create(
        { id_personagem: characterId, id_item, refinamento: 0, equipada: false },
        { transaction },
      );
      const item = await Item.findByPk(id_item, { transaction });
      resultado = {
        tipo: "fabricacao",
        instancia: { id: instancia.id, id_item, nome: item.nome, raridade: item.raridade, refinamento: 0 },
      };
    } else if (entrada.tipo_acao === TIPOS_ACAO_FORJA.REFINAMENTO) {
      const { id_instancia } = entrada.referencia;
      const { sucesso } = entrada.payload_resultado;
      const instancia = await CharacterEquipmentInstance.findOne({
        where: { id: id_instancia, id_personagem: characterId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (instancia && sucesso) {
        instancia.refinamento += 1;
        await instancia.save({ transaction });
      }
      resultado = {
        tipo: "refinamento",
        sucesso,
        refinamento_atual: instancia?.refinamento ?? null,
      };
    } else {
      resultado = { tipo: entrada.tipo_acao };
    }

    const ganho = entrada.payload_resultado.xp ?? 0;
    if (progresso && ganho > 0) {
      const resultadoXp = aplicarGanhoDeXp(progresso.experiencia, ganho);
      progresso.experiencia = resultadoXp.xpTotal;
      progresso.nivel = resultadoXp.nivelDepois;
      await progresso.save({ transaction });
      resultado.xp_ganho = resultadoXp.xpGanho;
      resultado.subiu_nivel = resultadoXp.subiuNivel;
      resultado.nivel_forja = resultadoXp.nivelDepois;
    }

    // Guilda dos Aventureiros (§43/§45) — "fabrique X" (missão livre) e
    // contratos de Rank Fabricar/Refinar só avançam aqui, no momento
    // real de COLETA (nunca ao só enfileirar o trabalho, e nunca por
    // simplesmente possuir um item comprado) — distinguindo Fabricar de
    // Refinar como a spec pede (§43).
    const personagem = await Character.findByPk(characterId, { transaction });
    if (personagem && entrada.tipo_acao === TIPOS_ACAO_FORJA.FABRICACAO) {
      await registrarProgresso(personagem, "Fabricar", 1, transaction);
      await registrarProgressoContrato(personagem, "Fabricar", 1, {}, transaction);
    } else if (personagem && entrada.tipo_acao === TIPOS_ACAO_FORJA.REFINAMENTO && resultado.sucesso) {
      await registrarProgressoContrato(personagem, "Refinar", 1, {}, transaction);
    }

    await entrada.destroy({ transaction });
    return resultado;
  });
}

// Equipamentos forjados/refinados do personagem (spec §26 — instâncias
// individuais, cada uma com seu próprio refinamento). Não inclui
// equipamento obtido fora da Forja v3 (esse continua em CharacterInventory,
// ver comentário na migration de instâncias).
async function listarInstancias(characterId) {
  const instancias = await CharacterEquipmentInstance.findAll({
    where: { id_personagem: characterId },
    include: [{ model: Item, as: "item" }],
    order: [["id", "DESC"]],
  });
  return instancias.map((instancia) => ({
    id: instancia.id,
    id_item: instancia.id_item,
    nome: instancia.item.nome,
    raridade: instancia.item.raridade,
    tipo_item: instancia.item.tipo_item,
    imagem_url: instancia.item.imagem_url,
    refinamento: instancia.refinamento,
    equipada: instancia.equipada,
  }));
}

const SLOT_POR_CATEGORIA_ARMA = "ArmaPrincipal";

// Equipa uma instância forjada no slot certo — resolvido a partir da
// própria ArmorProperties do item (Cabeca/Torso/Maos/Pes/Acessorio1/2)
// ou, pra armas, sempre em ArmaPrincipal (sem dual-wield nesta versão).
// NOTA (gap documentado no relatório final): o bônus percentual do
// refinamento (spec §24) ainda não é somado por equipmentBonusService.js
// ao equipar — a instância guarda o refinamento corretamente, mas ele
// ainda não afeta o combate. Fica como próximo passo natural em cima
// desta base.
async function equiparInstancia(characterId, idInstancia) {
  return sequelize.transaction(async (transaction) => {
    // Sem lock+include combinados (Postgres recusa FOR UPDATE do lado
    // nullable de um LEFT OUTER JOIN) — mesmo contorno já usado em
    // craftingController.coletarForja/combatController: trava a
    // instância "pura" primeiro, busca o Item à parte, sem lock.
    const instancia = await CharacterEquipmentInstance.findOne({
      where: { id: idInstancia, id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!instancia) throw Object.assign(new Error("Equipamento não encontrado."), { statusCode: 404 });

    const item = await Item.findByPk(instancia.id_item, { transaction });

    let slot;
    if (item.tipo_item === "Arma") {
      slot = SLOT_POR_CATEGORIA_ARMA;
    } else {
      const propriedades = await ArmorProperties.findByPk(instancia.id_item, { transaction });
      if (!propriedades) {
        throw Object.assign(new Error("Esse item não pode ser equipado."), { statusCode: 400 });
      }
      slot = propriedades.slot_equipamento;
    }

    const instanciaAnteriorNoSlot = await CharacterEquipment.findOne({
      where: { id_personagem: characterId, slot },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (instanciaAnteriorNoSlot?.id_instancia) {
      await CharacterEquipmentInstance.update(
        { equipada: false },
        { where: { id: instanciaAnteriorNoSlot.id_instancia }, transaction },
      );
    }

    await CharacterEquipment.upsert(
      { id_personagem: characterId, slot, id_item: instancia.id_item, id_instancia: instancia.id },
      { transaction },
    );
    instancia.equipada = true;
    await instancia.save({ transaction });

    return { slot, id_instancia: instancia.id };
  });
}

module.exports = {
  garantirProgresso,
  listarProgresso,
  listarFila,
  coletar,
  listarInstancias,
  equiparInstancia,
};
