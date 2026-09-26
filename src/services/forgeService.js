// Orquestrador da Forja v3 — progresso, leitura da fila (2 slots) e
// coleta. Fundição/Fabricação/Refinamento em si moram nos services
// dedicados (forgeSmeltingService/forgeCraftingService/
// forgeRefinementService); aqui só o que é comum aos três.
const { sequelize } = require("../config/database");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterForgeQueue = require("../models/CharacterForgeQueue");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const Item = require("../models/Item");
const equipmentInstanceService = require("./equipmentInstanceService");
const { TIPOS_ACAO_FORJA } = require("../config/forgeConfig");
const { nivelPorXpTotal, xpParaProximoNivel, aplicarGanhoDeXp } = require("./forgeProgressionService");
const Character = require("../models/Character");
const { registrarProgresso } = require("./missionService");
const { registrarProgressoContrato } = require("./adventureGuildObjectiveService");
const { registrarProgressoMissaoGuilda } = require("./guildMissionService");
const achievementService = require("./achievementService");
const { bonusesAtivosPara: bonusesTavernaAtivosPara } = require("./tavernBuffService");
const forgeTelemetryService = require("./forgeTelemetryService");
const uniqueFeatService = require("./uniqueFeatService");
const uniqueFeatPublicService = require("./uniqueFeatPublicService");

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
  const resultadoColeta = await sequelize.transaction(async (transaction) => {
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
      // Reformulação V2 (§6.3): a raridade da cópia é a qualidade JÁ
      // sorteada no início (payload_resultado.qualidade_final) — nunca
      // lida do Item, que agora é só a identidade canônica do
      // equipamento, igual em toda raridade.
      const instancia = await equipmentInstanceService.create(
        { idPersonagem: characterId, idItem: id_item, raridade: qualidade_final },
        transaction,
      );
      const item = await Item.findByPk(id_item, { transaction });
      resultado = {
        tipo: "fabricacao",
        instancia: { id: instancia.id, id_item, nome: item.nome, raridade: qualidade_final, refinamento: 0 },
      };

      // Sistema de Proezas Únicas §16 — na coleta REAL da fabricação
      // (nunca na prévia/enfileiramento), dentro desta MESMA transaction.
      // raridade vem de qualidade_final (a raridade REAL sorteada desta
      // cópia) — nunca de item.raridade, que na Reformulação V2 é só a
      // identidade canônica "Comum" do equipamento, igual em toda
      // fabricação (ver equipmentRarityService.js).
      resultado.proezasConquistadas = (
        await uniqueFeatService.check(
          "FORGE_CRAFT_COMPLETED",
          {
            blueprintId: entrada.referencia.id_blueprint,
            itemId: id_item,
            raridade: qualidade_final,
            resultado: qualidade_final,
          },
          { transaction, characterId, sourceEventId: `forge-craft:${entrada.id}` },
        )
      ).map((p) => ({ key: p.feat.key, nome: p.feat.nome }));
    } else if (entrada.tipo_acao === TIPOS_ACAO_FORJA.REFINAMENTO) {
      const { id_instancia } = entrada.referencia;
      const { sucesso } = entrada.payload_resultado;
      const instancia = await CharacterEquipmentInstance.findOne({
        where: { id: id_instancia, id_personagem: characterId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const nivelAlvo = (instancia?.refinamento ?? 0) + 1;
      if (instancia && sucesso) {
        instancia.refinamento += 1;
        await instancia.save({ transaction });
      }
      resultado = {
        tipo: "refinamento",
        sucesso,
        refinamento_atual: instancia?.refinamento ?? null,
      };

      // Sistema de Proezas Únicas §16 — na conclusão REAL do refino
      // (sucesso ou falha; a condição secreta decide o que importa),
      // dentro desta MESMA transaction.
      resultado.proezasConquistadas = (
        await uniqueFeatService.check(
          "FORGE_REFINEMENT_COMPLETED",
          {
            instanceId: id_instancia,
            targetLevel: nivelAlvo,
            sucesso,
            scrollKey: String(entrada.referencia.id_item_pergaminho ?? ""),
          },
          { transaction, characterId, sourceEventId: `forge-refinement:${entrada.id}` },
        )
      ).map((p) => ({ key: p.feat.key, nome: p.feat.nome }));
    } else {
      resultado = { tipo: entrada.tipo_acao };
    }

    let ganho = entrada.payload_resultado.xp ?? 0;
    if (progresso && ganho > 0) {
      // FORGE_XP_PCT da Taverna (§13) — aplicado na CONCESSÃO de XP de
      // Fabricação, nunca na chance de sucesso do degrau de qualidade
      // (isso já foi decidido lá atrás, em forjaPontosPercentuais).
      const bonusTaverna = await bonusesTavernaAtivosPara(characterId, "Forja", transaction);
      if (bonusTaverna.FORGE_XP_PCT) {
        ganho = Math.round(ganho * (1 + bonusTaverna.FORGE_XP_PCT / 100));
      }
      const resultadoXp = aplicarGanhoDeXp(progresso.experiencia, ganho);
      progresso.experiencia = resultadoXp.xpTotal;
      progresso.nivel = resultadoXp.nivelDepois;
      await progresso.save({ transaction });
      resultado.xp_ganho = resultadoXp.xpGanho;
      resultado.subiu_nivel = resultadoXp.subiuNivel;
      resultado.nivel_forja = resultadoXp.nivelDepois;

      // Perfil de Jogador (§23) — só checa em level up de verdade, não
      // em todo ganho de XP.
      if (resultadoXp.subiuNivel) {
        await achievementService.checkForgeAchievements(characterId, transaction);
      }
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
      await registrarProgressoMissaoGuilda(personagem, "Fabricar", 1, transaction);
    } else if (personagem && entrada.tipo_acao === TIPOS_ACAO_FORJA.REFINAMENTO && resultado.sucesso) {
      await registrarProgressoContrato(personagem, "Refinar", 1, {}, transaction);
      await registrarProgressoMissaoGuilda(personagem, "Refinar", 1, transaction);
    }

    if (entrada.tipo_acao === TIPOS_ACAO_FORJA.FABRICACAO) {
      await forgeTelemetryService.registrarEvento(
        {
          tipo_acao: "Fabricacao",
          id_personagem: characterId,
          id_blueprint: entrada.referencia.id_blueprint,
          qualidade_base: entrada.referencia.qualidade_material,
          qualidade_final: entrada.payload_resultado.qualidade_final,
          xp_ganho: resultado.xp_ganho ?? 0,
        },
        transaction,
      );
    } else if (entrada.tipo_acao === TIPOS_ACAO_FORJA.REFINAMENTO) {
      await forgeTelemetryService.registrarEvento(
        {
          tipo_acao: "Refinamento",
          id_personagem: characterId,
          categoria_equipamento: entrada.referencia.categoria_equipamento ?? null,
          qualidade_base: entrada.referencia.qualidade_item ?? null,
          alvo_refinamento: entrada.referencia.alvo,
          sucesso: entrada.payload_resultado.sucesso,
          gold_delta: entrada.referencia.ouro_custo ?? 0,
          xp_ganho: resultado.xp_ganho ?? 0,
          id_item_pergaminho: entrada.referencia.id_item_pergaminho ?? null,
        },
        transaction,
      );
    }

    await entrada.destroy({ transaction });
    return resultado;
  });

  // Sistema de Proezas Únicas §12.1 — SÓ depois do commit acima (nunca
  // de dentro da transaction).
  await uniqueFeatPublicService.anunciarConquistas(resultadoColeta.proezasConquistadas);
  return resultadoColeta;
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
    raridade: instancia.raridade,
    tipo_item: instancia.item.tipo_item,
    imagem_url: instancia.item.imagem_url,
    refinamento: instancia.refinamento,
    equipada: instancia.equipada,
    estado: instancia.estado,
  }));
}

// Equipar uma instância forjada agora é só uma chamada ao service
// central (Inventário v2 — spec §12), que resolve o slot certo a
// partir do item, cuida do refinamento e da concorrência. Mantido aqui
// só por compatibilidade de import (POST /crafting/instances/:id/equip
// continua chamando forgeService.equiparInstancia).
async function equiparInstancia(characterId, idInstancia) {
  return sequelize.transaction((transaction) => equipmentInstanceService.equip(characterId, idInstancia, transaction));
}

module.exports = {
  garantirProgresso,
  listarProgresso,
  listarFila,
  coletar,
  listarInstancias,
  equiparInstancia,
};
