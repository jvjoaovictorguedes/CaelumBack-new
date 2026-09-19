// src/controllers/rankGateController.js
//
// Portal de Ranque — combate interativo turno a turno (mesmo motor da
// Aventura, ver combatController.js), com dificuldade escolhida pelo
// jogador. Vencer não promove sozinho: cada dificuldade rende pontos,
// promove só ao acumular PONTOS_NECESSARIOS no ranque atual (ver
// rankGateService.js pro raciocínio completo).
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const RankGate = require("../models/RankGate");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const CharacterInventory = require("../models/CharacterInventory");
const Item = require("../models/Item");
const ConsumableProperties = require("../models/ConsumableProperties");
const { adicionarExperiencia } = require("../services/experienceService");
const { registrarProgresso } = require("../services/missionService");
const {
  calcularDanoBasico,
  aplicarMitigacaoDeDefesa,
  calcularEfeitoPoder,
  custoManaEfetivo,
  chanceDeEsquiva,
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { sincronizarRegeneracaoDeVida } = require("../services/regenService");
const {
  encontroDoCampoValido,
  limparEncontroDoCampoExpirado,
} = require("../services/pveEncounterService");
const { proximoRank, ehRankValido } = require("../services/rankService");
const {
  DIFICULDADES,
  PONTOS_POR_DIFICULDADE,
  PONTOS_NECESSARIOS,
  FRAGMENTOS_POR_DIFICULDADE,
  ehDificuldadeValida,
  gerarChefeComDificuldade,
  recompensaComDificuldade,
} = require("../services/rankGateService");
const { concederItem } = require("../services/dropService");
const { NOME_ITEM_FRAGMENTO } = require("../services/abilityLevelService");
const { concederOuro } = require("../services/goldService");

const CAMPO_ENCONTRO = "encontro_rank_gate";
const COOLDOWN_DERROTA_MS = 5 * 60 * 1000;
// Auditoria de economia (pedido do jogador): vencer o Portal nunca
// aplicava cooldown nenhum (só perder aplicava, ver COOLDOWN_DERROTA_MS
// abaixo) — um personagem capaz de vencer o próprio ranque conseguia
// encadear vitórias sem NENHUM intervalo, e cada vitória em Muito
// Difícil no ranque S+ paga até 44.000 de ouro (22.000 base x2) de uma
// vez, de graça, num loop sem fim. Isso sozinho é a maior fonte de
// inflação do jogo, muito acima de PvE (Aventura paga só dezenas/poucas
// centenas por luta) ou missões (dezenas por dia). Cooldown curto (bem
// menor que o de derrota, pra não punir quem só quer jogar) fecha o
// loop sem tornar o Portal inviável pra quem de fato usa ele pra subir
// de ranque.
const COOLDOWN_VITORIA_MS = 60 * 1000;

function limparEncontroRankGate(character) {
  return limparEncontroDoCampoExpirado(character, CAMPO_ENCONTRO);
}

// Maior das duas janelas de cooldown ainda ativas (derrota OU vitória) —
// fonte única usada tanto pelo GET de status quanto pelo POST que entra
// no portal, pra nunca ficarem dessincronizados sobre quando o jogador
// pode tentar de novo.
function cooldownRestanteMs(character) {
  const restanteDerrota = character.ultima_tentativa_rank_gate
    ? COOLDOWN_DERROTA_MS - (Date.now() - new Date(character.ultima_tentativa_rank_gate).getTime())
    : 0;
  const restanteVitoria = character.ultima_vitoria_rank_gate
    ? COOLDOWN_VITORIA_MS - (Date.now() - new Date(character.ultima_vitoria_rank_gate).getTime())
    : 0;
  return Math.max(0, restanteDerrota, restanteVitoria);
}

function encontroRankGateValido(character) {
  return encontroDoCampoValido(character, CAMPO_ENCONTRO);
}

// O encontro é salvo achatado (chefe + metadados no mesmo nível, nunca
// `{ chefe: {...} }` aninhado) de propósito: `encontroDoCampoValido` só
// faz um shallow-copy (`{ ...encontro }`), então uma sub-chave objeto
// continuaria sendo a MESMA referência do JSONB já carregado — mutar
// `chefe.vida_atual` mutaria o valor "antigo" também, e o Sequelize (ao
// comparar antigo vs. novo na hora de decidir o que persistir) não veria
// diferença nenhuma e pularia o UPDATE (mesma pegadinha documentada em
// pveEncounterService.js). Com tudo achatado, vida_atual é um número
// (copiado por valor), sem esse risco. Esta função só separa os campos
// de metadado dos campos do próprio chefe pra quem for usar cada um.
function separarChefeDoEncontro(encontro) {
  const { dificuldade, statsPersonagem, criadoEm, ...chefe } = encontro;
  return { chefe, dificuldade, statsPersonagem, criadoEm };
}

// GET /characters/:id/rank-gate — status do portal do ranque atual:
// pontos acumulados, cooldown (só existe depois de uma derrota) e o
// combate em andamento, se houver (pra retomar sem perder progresso
// numa troca de aba/reload).
exports.getPortalAtual = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id);
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    if (limparEncontroRankGate(character)) {
      await character.save();
    }

    const chefeBase = await RankGate.findOne({ where: { rank: character.rank } });
    const proximo = proximoRank(character.rank);
    const cooldownMsRestante = cooldownRestanteMs(character);

    const encontroAtivo = encontroRankGateValido(character);

    res.status(200).json({
      status: "success",
      data: {
        rank_atual: character.rank,
        proximo_rank: proximo,
        portal: chefeBase,
        dificuldades: DIFICULDADES,
        pontos_atual: character.pontos_portal_atual,
        pontos_necessarios: PONTOS_NECESSARIOS,
        pontos_por_dificuldade: PONTOS_POR_DIFICULDADE,
        pode_tentar: Boolean(chefeBase) && cooldownMsRestante === 0,
        cooldown_restante_ms: cooldownMsRestante,
        encontro_ativo: encontroAtivo
          ? { dificuldade: encontroAtivo.dificuldade, enemy: separarChefeDoEncontro(encontroAtivo).chefe }
          : null,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar portal de ranque:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar portal." });
  }
};

// POST /characters/:id/rank-gate/start — escolhe a dificuldade e entra
// no portal. Cura o personagem antes (mesma convenção de "sala de
// chefe" — não é justo arrastar dano da Aventura pra cá).
exports.iniciarPortal = async (req, res) => {
  const { dificuldade } = req.body;
  if (!ehDificuldadeValida(dificuldade)) {
    return res.status(400).json({ message: `Dificuldade inválida. Use uma de: ${DIFICULDADES.join(", ")}.` });
  }

  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.params.id, {
        include: [{ model: Class }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }
      if (!ehRankValido(character.rank)) {
        throw Object.assign(new Error("Ranque do personagem inválido."), { statusCode: 400 });
      }
      const proximo = proximoRank(character.rank);
      if (!proximo) {
        throw Object.assign(new Error("Este personagem já está no ranque máximo (S++)."), {
          statusCode: 400,
        });
      }

      limparEncontroRankGate(character);

      // Já tem um combate de portal em andamento — devolve ELE, não
      // deixa trocar de dificuldade no meio da luta.
      const encontroAtivo = encontroRankGateValido(character);
      if (encontroAtivo) {
        const { chefe, dificuldade: dificuldadeAtiva } = separarChefeDoEncontro(encontroAtivo);
        return { character, chefe, dificuldade: dificuldadeAtiva, retomado: true };
      }

      if (character.encontro_pve) {
        throw Object.assign(
          new Error("Termine o combate de Aventura em andamento antes de entrar no portal."),
          { statusCode: 409 },
        );
      }

      const restanteMs = cooldownRestanteMs(character);
      if (restanteMs > 0) {
        throw Object.assign(
          new Error(`Aguarde ${Math.ceil(restanteMs / 1000)}s antes de tentar o portal de novo.`),
          { statusCode: 429 },
        );
      }

      const chefeBase = await RankGate.findOne({ where: { rank: character.rank }, transaction });
      if (!chefeBase) {
        throw Object.assign(new Error("Nenhum portal cadastrado para este ranque ainda."), {
          statusCode: 404,
        });
      }

      const bonusEquipamento = await buscarBonusDeAtributos(character.id, transaction);
      const jogadorEfetivo = comMultiplicadoresDeClasse(
        personagemComBonus(character.toJSON(), bonusEquipamento),
        character.Class,
      );

      const chefe = gerarChefeComDificuldade(chefeBase, dificuldade);

      // Snapshot dos atributos estruturais do jogador (igual Aventura) —
      // fica congelado até o combate terminar, só vida/mana atuais
      // continuam vivas turno a turno.
      const statsPersonagem = {
        nivel: character.nivel,
        forca: jogadorEfetivo.forca,
        vitalidade: jogadorEfetivo.vitalidade,
        agilidade: jogadorEfetivo.agilidade,
        inteligencia: jogadorEfetivo.inteligencia,
        velocidade: jogadorEfetivo.velocidade,
        defesa: jogadorEfetivo.defesa,
        arma_equipada: jogadorEfetivo.arma_equipada,
        multiplicador_vida_por_nivel: jogadorEfetivo.multiplicador_vida_por_nivel,
        multiplicador_mana_por_nivel: jogadorEfetivo.multiplicador_mana_por_nivel,
        multiplicador_dano_fisico: jogadorEfetivo.multiplicador_dano_fisico,
        multiplicador_dano_magico: jogadorEfetivo.multiplicador_dano_magico,
      };

      // Cura total antes de entrar — é uma sala de chefe, não uma
      // continuação da última luta.
      character.vida_atual = vidaMaximaDe(jogadorEfetivo);
      character.mana_atual = manaMaximaDe(jogadorEfetivo);
      character.ultima_atualizacao_vida = new Date();
      character[CAMPO_ENCONTRO] = { ...chefe, dificuldade, statsPersonagem, criadoEm: Date.now() };
      await character.save({ transaction });

      return { character, chefe, dificuldade, retomado: false };
    });

    res.status(200).json({
      status: "success",
      data: {
        enemy: resultado.chefe,
        dificuldade: resultado.dificuldade,
        retomado: resultado.retomado,
        character: {
          vida_atual: resultado.character.vida_atual,
          mana_atual: resultado.character.mana_atual,
        },
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao iniciar portal de ranque:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao iniciar o portal." });
  }
};

// POST /characters/:id/rank-gate/action — um turno do combate contra o
// chefe do portal. Estrutura igual combatController.processarTurno
// (ataque básico/poder/item, depois turno do chefe), só que a vitória
// rende pontos de progresso em vez de resolver o combate inteiro numa
// tacada só.
exports.atacarPortal = async (req, res) => {
  const { action } = req.body;
  if (!action) {
    return res.status(400).json({ message: "Dados insuficientes para resolver o turno de combate." });
  }

  try {
    return await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.params.id, {
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      if (!character) {
        return res.status(404).json({ message: "Personagem não encontrado." });
      }

      const encontroAtivo = encontroRankGateValido(character);
      if (!encontroAtivo) {
        return res.status(400).json({
          message: "Nenhum combate de portal ativo. Escolha uma dificuldade e entre no portal antes de atacar.",
        });
      }

      const { chefe: chefeAtual, dificuldade, statsPersonagem, criadoEm } = separarChefeDoEncontro(encontroAtivo);
      const log = [];

      const personagemAtual = {
        ...character.toJSON(),
        ...statsPersonagem,
        vida_atual: character.vida_atual,
        mana_atual: character.mana_atual,
      };
      sincronizarRegeneracaoDeVida(character, personagemAtual);

      if (personagemAtual.vida_atual <= 0) {
        return res.status(400).json({ message: "Este personagem está derrotado e precisa se recuperar." });
      }

      let poderUsado = null;
      let nivelHabilidadeUsada = 1;
      if (action.type === "power") {
        poderUsado = await Power.findByPk(action.powerId);
        if (!poderUsado) {
          return res.status(404).json({ message: "Poder não encontrado." });
        }
        const aprendeu = await CharacterAbilities.findOne({
          where: { id_personagem: character.id, id_power: poderUsado.id },
        });
        if (!aprendeu) {
          return res.status(403).json({ message: "Este personagem não aprendeu este poder." });
        }
        if (!aprendeu.is_active) {
          return res.status(403).json({ message: "Este poder não está ativo para este personagem." });
        }
        if (poderUsado.tipo_poder !== "Ativo") {
          return res.status(403).json({ message: "Este poder não pode ser usado manualmente em combate." });
        }
        nivelHabilidadeUsada = aprendeu.nivel_habilidade;
        if (personagemAtual.mana_atual < custoManaEfetivo(poderUsado, nivelHabilidadeUsada)) {
          return res.status(400).json({ message: "Mana insuficiente." });
        }
      }

      let inventoryEntry = null;
      let itemConsumivel = null;
      let efeitoConsumivel = null;
      if (action.type === "item") {
        inventoryEntry = await CharacterInventory.findOne({
          where: { id_personagem: character.id, id_item: action.itemId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!inventoryEntry || inventoryEntry.quantidade < 1) {
          return res.status(400).json({ message: "Você não possui esse item no inventário." });
        }
        itemConsumivel = await Item.findByPk(action.itemId, { transaction });
        if (!itemConsumivel || itemConsumivel.tipo_item !== "Consumivel") {
          return res.status(400).json({ message: "Este item não pode ser usado em combate." });
        }
        efeitoConsumivel = await ConsumableProperties.findByPk(action.itemId, { transaction });
        if (!efeitoConsumivel) {
          return res.status(400).json({ message: "Este item não possui efeito configurado." });
        }
      }

      // ================= TURNO DO JOGADOR =================
      if (poderUsado) {
        personagemAtual.mana_atual -= custoManaEfetivo(poderUsado, nivelHabilidadeUsada);
        const { dano, cura } = calcularEfeitoPoder(poderUsado, personagemAtual, nivelHabilidadeUsada);
        if (dano > 0) {
          if (chanceDeEsquiva(chefeAtual, personagemAtual)) {
            log.push(`${chefeAtual.nome} esquivou de ${poderUsado.nome}!`);
          } else {
            const danoMitigado = aplicarMitigacaoDeDefesa(dano, chefeAtual);
            chefeAtual.vida_atual = Math.max(0, chefeAtual.vida_atual - danoMitigado);
            log.push(`Você usou ${poderUsado.nome} e causou ${danoMitigado} de dano em ${chefeAtual.nome}.`);
          }
        }
        if (cura > 0) {
          personagemAtual.vida_atual = Math.min(vidaMaximaDe(personagemAtual), personagemAtual.vida_atual + cura);
          log.push(`Você usou ${poderUsado.nome} e recuperou ${cura} de vida.`);
        }
      } else if (efeitoConsumivel) {
        if (efeitoConsumivel.efeito_vida) {
          const cura = Math.round(vidaMaximaDe(personagemAtual) * (efeitoConsumivel.efeito_vida / 100));
          personagemAtual.vida_atual = Math.min(vidaMaximaDe(personagemAtual), personagemAtual.vida_atual + cura);
          log.push(`Você usou ${itemConsumivel.nome} e recuperou ${cura} de vida.`);
        }
        if (efeitoConsumivel.efeito_mana) {
          const curaMana = Math.round(manaMaximaDe(personagemAtual) * (efeitoConsumivel.efeito_mana / 100));
          personagemAtual.mana_atual = Math.min(manaMaximaDe(personagemAtual), personagemAtual.mana_atual + curaMana);
          log.push(`Você usou ${itemConsumivel.nome} e recuperou ${curaMana} de mana.`);
        }
        inventoryEntry.quantidade -= 1;
        if (inventoryEntry.quantidade <= 0) {
          await inventoryEntry.destroy({ transaction });
        } else {
          await inventoryEntry.save({ transaction });
        }
      } else {
        if (chanceDeEsquiva(chefeAtual, personagemAtual)) {
          log.push(`${chefeAtual.nome} esquivou do seu ataque!`);
        } else {
          const dano = aplicarMitigacaoDeDefesa(calcularDanoBasico(personagemAtual), chefeAtual);
          chefeAtual.vida_atual = Math.max(0, chefeAtual.vida_atual - dano);
          log.push(`Você atacou e causou ${dano} de dano em ${chefeAtual.nome}.`);
        }
      }

      // ================= CHECA VITÓRIA =================
      if (chefeAtual.vida_atual <= 0) {
        const chefeBase = await RankGate.findOne({ where: { rank: character.rank }, transaction });
        const recompensa = recompensaComDificuldade(chefeBase, dificuldade);
        const pontosGanhos = PONTOS_POR_DIFICULDADE[dificuldade];

        concederOuro(character, recompensa.dinheiro);
        character.vida_atual = personagemAtual.vida_atual;
        character.mana_atual = personagemAtual.mana_atual;
        character.ultima_atualizacao_vida = new Date();
        character[CAMPO_ENCONTRO] = null;
        character.pontos_portal_atual += pontosGanhos;
        // Ver COOLDOWN_VITORIA_MS no topo do arquivo — fecha o loop de
        // farm infinito que não tinha NENHUM intervalo entre vitórias.
        character.ultima_vitoria_rank_gate = new Date();

        let rankPromovido = null;
        if (character.pontos_portal_atual >= PONTOS_NECESSARIOS) {
          rankPromovido = proximoRank(character.rank);
          character.rank = rankPromovido;
          character.pontos_portal_atual = 0;
        }

        let resultadoXP = null;
        if (recompensa.xp > 0) {
          resultadoXP = await adicionarExperiencia(character.id, recompensa.xp, { transaction, personagem: character });
        }
        await registrarProgresso(character, "GanharOuro", recompensa.dinheiro, transaction);

        // Fragmento de Grimório garantido por vitória (não é sorteio como
        // o drop de PvE comum) — dá ao Portal um motivo extra pra arriscar
        // a dificuldade mais alta, além de ouro/xp/pontos de ranque.
        const fragmentosGanhos = FRAGMENTOS_POR_DIFICULDADE[dificuldade];
        const itemFragmento = await Item.findOne({ where: { nome: NOME_ITEM_FRAGMENTO }, transaction });
        if (itemFragmento) {
          await concederItem(character.id, itemFragmento.id, fragmentosGanhos, transaction);
          log.push(`Você encontrou ${fragmentosGanhos}x ${NOME_ITEM_FRAGMENTO}!`);
        }

        await character.save({ transaction });

        if (resultadoXP?.niveisGanhos > 0) {
          for (let i = 1; i <= resultadoXP.niveisGanhos; i++) {
            log.push(`Seu personagem subiu para o nível ${resultadoXP.nivel - resultadoXP.niveisGanhos + i}!`);
          }
        }
        log.push(`${chefeAtual.nome} foi derrotado! Você ganhou ${recompensa.xp} de experiência e ${recompensa.dinheiro} moedas.`);
        log.push(
          rankPromovido
            ? `Pontos do portal completos! Você foi promovido para o ranque ${rankPromovido}.`
            : `Pontos do portal: ${character.pontos_portal_atual}/${PONTOS_NECESSARIOS}.`,
        );

        return res.status(200).json({
          status: "success",
          data: {
            done: true,
            victory: true,
            log,
            character: {
              vida_atual: personagemAtual.vida_atual,
              mana_atual: personagemAtual.mana_atual,
              nivel: resultadoXP?.nivel ?? character.nivel,
              experiencia: resultadoXP?.experiencia ?? character.experiencia,
              dinheiro: character.dinheiro,
              pontos_distribuir: resultadoXP?.pontos_distribuir ?? character.pontos_distribuir,
            },
            enemy: chefeAtual,
            rewards: { experiencia: recompensa.xp, dinheiro: recompensa.dinheiro },
            rank_promovido: rankPromovido,
            pontos_portal_atual: character.pontos_portal_atual,
            pontos_necessarios: PONTOS_NECESSARIOS,
          },
        });
      }

      // ================= TURNO DO CHEFE =================
      if (chanceDeEsquiva(personagemAtual, chefeAtual)) {
        log.push(`Você esquivou do ataque de ${chefeAtual.nome}!`);
      } else {
        const danoRecebido = aplicarMitigacaoDeDefesa(calcularDanoBasico(chefeAtual), personagemAtual);
        personagemAtual.vida_atual = Math.max(0, personagemAtual.vida_atual - danoRecebido);
        log.push(`${chefeAtual.nome} atacou e causou ${danoRecebido} de dano em você.`);
      }

      // ================= DERROTA =================
      const derrotado = personagemAtual.vida_atual <= 0;
      if (derrotado) {
        log.push("Você foi derrotado. Cure-se e tente o portal de novo depois do tempo de espera.");
        character.ultima_tentativa_rank_gate = new Date();
      }

      character.vida_atual = derrotado ? 0 : personagemAtual.vida_atual;
      character.mana_atual = personagemAtual.mana_atual;
      character.ultima_atualizacao_vida = new Date();
      character[CAMPO_ENCONTRO] = derrotado
        ? null
        : { ...chefeAtual, dificuldade, statsPersonagem, criadoEm };
      await character.save({ transaction });

      return res.status(200).json({
        status: "success",
        data: {
          done: derrotado,
          victory: false,
          log,
          character: {
            vida_atual: derrotado ? 0 : personagemAtual.vida_atual,
            mana_atual: personagemAtual.mana_atual,
            nivel: character.nivel,
            experiencia: character.experiencia,
            pontos_distribuir: character.pontos_distribuir,
          },
          enemy: chefeAtual,
        },
      });
    });
  } catch (error) {
    console.error("Erro ao processar turno do portal de ranque:", error);
    res.status(500).json({ message: "Erro interno do servidor ao processar o combate do portal." });
  }
};
