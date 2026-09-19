// src/controllers/combatController.js
//
// Motor de combate por turnos (PvE).
// O combate usa os atributos do personagem e os poderes aprendidos
// para resolver os turnos.
//
// A lógica de progressão de XP/level/pontos fica no
// experienceService.js.

const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const CharacterInventory = require("../models/CharacterInventory");
const Item = require("../models/Item");
const ConsumableProperties = require("../models/ConsumableProperties");
const { adicionarExperiencia } = require("../services/experienceService");
const {
  calcularDanoBasico,
  aplicarMitigacaoDeDefesa,
  calcularEfeitoPoder,
  custoManaEfetivo,
  chanceDeEsquiva,
  vidaMaximaDe,
  manaMaximaDe,
  danoBasicoEsperado,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { sincronizarRegeneracaoDeVida } = require("../services/regenService");
const {
  encontroValido,
  limparEncontroExpirado,
  encontroDoCampoValido,
} = require("../services/pveEncounterService");
const { rolarDropDeVitoria } = require("../services/dropService");
const { registrarProgresso } = require("../services/missionService");
const { registrarMorte } = require("../services/monsterKillService");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonster = require("../models/AdventureMonster");
const { obterSessaoAtiva } = require("../services/adventureService");
const { sortearMonstroDaZona, sortearNivelMonstro } = require("../services/adventureRollService");
const { concederRecompensaDeZona } = require("../services/adventureRewardService");
const { concederOuro } = require("../services/goldService");

const NOMES_INIMIGOS = [
  "Lobo das Sombras",
  "Bandido Errante",
  "Golem de Pedra",
  "Espectro Sussurrante",
  "Orc Guerreiro",
  "Aranha Venenosa",
  "Cultista Renegado",
  "Draconídeo Jovem",
  "Minotauro",
];

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Estado do inimigo ativo, persistido em Character.encontro_pve (coluna
// JSONB) — não mais só em memória do processo. Antes um Map em memória
// (characterId -> inimigo) sobrevivia enquanto o processo Node ficasse de
// pé, mas qualquer restart (deploy, crash, autoscale) apagava todo
// combate em andamento sem aviso: o jogador via o inimigo na tela, clicava
// em atacar, e caía em "Nenhum combate ativo" do nada — o inimigo tinha
// sumido da memória mas a tela ainda mostrava ele. Persistir no personagem
// também resolve de graça a limitação de só funcionar com UMA instância
// do processo (documentada em rateLimitMiddleware.js pro rate limiter,
// que tem o mesmo problema).
//
// O inimigo nunca vem do cliente — só o servidor sabe o estado real.
// Qualquer `enemy` que o corpo da requisição ainda contenha é ignorado.
// (VALIDADE_ENCONTRO_MS/encontroValido/limparEncontroExpirado agora vêm
// de pveEncounterService.js — ver comentário lá sobre o motivo de terem
// saído daqui.)

// Quantos turnos de ataque básico, em média, cada lado precisa pra matar
// o outro. O do inimigo é maior de propósito: o jogador sai na frente
// (folga pra usar poder/errar um turno/tomar uma esquiva ruim), mas
// ainda precisa jogar direito — não é vitória de graça.
const RODADAS_PARA_MATAR_INIMIGO = 4;
const RODADAS_PARA_INIMIGO_MATAR_JOGADOR = 4.2;

// Gera um inimigo calibrado a partir dos ATRIBUTOS DE VERDADE do
// personagem (já com bônus de equipamento somado) — não mais só o nível.
// Antes o inimigo era pensado pra um "personagem médio" daquele nível
// (uma quantidade assumida de força/vitalidade); quem não investia
// pontos em vida, por exemplo, sempre enfrentava um inimigo tanque
// demais pro tanto de dano que conseguia causar, e vice-versa. Agora a
// vida do inimigo escala com o ataque real do jogador (se você bate
// forte, o inimigo aguenta mais golpes, mas você ainda mata em ~4
// turnos) e o dano do inimigo escala com a vida real do jogador (se
// você é frágil, o inimigo bate mais fraco, mas ainda ameaça em ~6
// turnos) — o resultado da luta depende do seu build de verdade, não
// de uma média que talvez nem seja a sua.
// `nomeAlvo` é opcional — pedido do jogador: poder "caçar" um monstro
// específico (ex.: Minotauro pro requisito de Evolução de Classe) em vez
// de só depender do sorteio aleatório entre os 9 nomes. Só é aceito se
// já estiver em NOMES_INIMIGOS (validado no controller antes de chegar
// aqui) — nunca um nome arbitrário vindo do cliente.
//
// `opcoes.nivelForcado` e `opcoes.multiplicadores` vêm do Modo Aventura
// (§8/§9/§10 da spec, ver gerarInimigoParaPersonagem): o nível do
// monstro sorteado pela zona substitui o nível do PRÓPRIO jogador (uma
// zona de nível baixo precisa gerar monstro de nível baixo mesmo pra um
// personagem de nível alto caçando lá), e os multiplicadores do
// AdventureMonster dão identidade de combate própria a cada criatura em
// cima da MESMA calibração — nunca uma escala nova.
function gerarInimigo(jogador, nomeAlvo, opcoes = {}) {
  const { nivelForcado, multiplicadores } = opcoes;
  const mult = {
    vida: multiplicadores?.vida ?? 1,
    dano: multiplicadores?.dano ?? 1,
    agilidade: multiplicadores?.agilidade ?? 1,
    velocidade: multiplicadores?.velocidade ?? 1,
  };
  const nivel = Math.max(1, nivelForcado ?? jogador.nivel ?? 1);
  const variacao = () => 0.9 + Math.random() * 0.2; // ±10%

  const vidaJogador = vidaMaximaDe(jogador);
  const ataqueJogador = Math.max(1, danoBasicoEsperado(jogador));

  const vidaMaxima = Math.max(
    20,
    Math.round(ataqueJogador * RODADAS_PARA_MATAR_INIMIGO * variacao() * mult.vida),
  );
  const danoBase = Math.max(
    1,
    Math.round((vidaJogador / RODADAS_PARA_INIMIGO_MATAR_JOGADOR) * variacao() * mult.dano),
  );

  // Agilidade/velocidade espelham as do próprio jogador (com variação),
  // pra esquiva e ordem de turno ficarem parelhas com o que ele tem —
  // em vez de, de novo, assumir uma agilidade "média" pro nível.
  const agilidade = Math.max(1, Math.round((jogador.agilidade || 1) * variacao() * mult.agilidade));
  const velocidade = Math.max(1, Math.round((jogador.velocidade || 1) * variacao() * mult.velocidade));

  // forca/vitalidade do inimigo aqui são só pra manter o formato da
  // resposta (a API sempre devolveu esses campos) — quem decide o
  // resultado da luta é vida_maxima/dano_base calculados acima.
  const forca = Math.max(1, Math.round((danoBase - 3) / 0.7));
  const vitalidade = Math.max(1, Math.round((vidaMaxima - 20) / 5));

  return {
    nome: nomeAlvo ?? sortear(NOMES_INIMIGOS),
    nivel,
    forca,
    vitalidade,
    agilidade,
    velocidade,
    vida_maxima: vidaMaxima,
    vida_atual: vidaMaxima,
    dano_base: danoBase,
  };
}

// GET /api/combat/enemy/:characterId
// Gera um inimigo compatível com o nível do personagem.
//
// Roda inteira dentro de uma transação com o personagem travado
// (LOCK.UPDATE), do mesmo jeito que executarTurno — sem isso, duas
// chamadas concorrentes a esta rota (duplo clique, duas abas, ou o
// React re-executando o carregamento da tela de Aventura) liam
// encontro_pve como "vazio" ao mesmo tempo, cada uma gerava e SALVAVA
// um inimigo diferente, e a última a salvar vencia — a tela do jogador
// podia ficar mostrando um inimigo (da resposta que chegou primeiro)
// que já não é mais o que está de fato em encontro_pve no banco. Daí
// em diante, qualquer ataque batia em "Nenhum combate ativo" mesmo com
// a tela mostrando um inimigo na cara do jogador. Não inclui Class no
// SELECT travado (FOR UPDATE não pode se aplicar ao lado nullable de um
// LEFT JOIN) — busca a classe à parte, sem lock, como o resto da base
// já faz nesse mesmo contorno.
exports.gerarInimigoParaPersonagem = async (req, res) => {
  try {
    return await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.personagemAtual.id, {
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });

      if (!character) {
        return res.status(404).json({
          message: "Personagem não encontrado.",
        });
      }

      // Se já existe um encontro em andamento (não expirado), devolve ELE
      // — nunca sorteia um novo. Sem essa checagem, chamar GET
      // /combat/enemy de novo no meio de uma luta ruim descartava o
      // inimigo atual (com o dano já sofrido) e sorteava outro do zero,
      // com vida cheia — um reroll de graça pra fugir de um inimigo difícil.
      const encontroEmAndamento = encontroValido(character);
      if (encontroEmAndamento) {
        const { criadoEm, statsPersonagem, ...inimigoAtual } = encontroEmAndamento;
        return res.status(200).json({
          status: "success",
          data: { enemy: inimigoAtual },
        });
      }

      // Não dá pra abrir uma Aventura nova com um Portal de Ranque em
      // andamento — mesma exclusão mútua que o Portal já aplica no
      // sentido contrário (ver rankGateController.iniciarPortal).
      if (encontroDoCampoValido(character, "encontro_rank_gate")) {
        return res.status(409).json({
          message: "Termine o combate do Portal de Ranque em andamento antes de partir para a Aventura.",
        });
      }

      // §1/§17/§29/§31 da spec do Modo Aventura: combate PvE não pode
      // mais começar fora de uma Área de Caça — validado aqui no
      // servidor (dentro da MESMA transação que trava o Character),
      // nunca só no frontend. Sem sessão ativa, nem chega a sortear
      // monstro nenhum.
      const sessaoAtiva = await obterSessaoAtiva(character.id, { transaction });
      if (!sessaoAtiva) {
        return res.status(409).json({
          message: "Entre em uma Área de Caça antes de procurar uma criatura.",
        });
      }

      const zona = sessaoAtiva.area;
      const monstrosDaZona = await AdventureZoneMonster.findAll({
        where: { id_area: zona.id, ativo: true },
        include: [{ model: AdventureMonster, as: "monstro" }],
        transaction,
      });
      if (monstrosDaZona.length === 0) {
        return res.status(500).json({
          message: "Área de Caça sem monstros configurados.",
        });
      }

      const classe = await Class.findByPk(character.id_classe, { transaction });
      const bonusEquipamento = await buscarBonusDeAtributos(character.id, transaction);
      const jogadorEfetivo = comMultiplicadoresDeClasse(
        personagemComBonus(character.toJSON(), bonusEquipamento),
        classe,
      );

      // Aplica a regeneração passiva acumulada antes de calibrar/entrar
      // em combate — sem isso, um jogador que ficou horas offline entrava
      // na luta com a vida velha (baixa), mesmo já tendo regenerado.
      // Muta `character`/`jogadorEfetivo` em memória; persistido junto
      // com encontro_pve no save abaixo, que já é obrigatório de
      // qualquer jeito.
      sincronizarRegeneracaoDeVida(character, jogadorEfetivo);

      // Query param opcional (?alvo=Minotauro) pra "caçar" um monstro
      // específico — ver comentário em gerarInimigo. Só é aceito se o
      // nome pertencer à ZONA ATUAL (nunca um nome arbitrário vindo do
      // cliente, e nunca um monstro de fora desta Área de Caça); nome
      // inválido/fora da zona é ignorado silenciosamente e cai no
      // sorteio ponderado normal (§6/§7), em vez de dar erro.
      const alvoPedido = typeof req.query.alvo === "string" ? req.query.alvo : null;
      const escolhido =
        (alvoPedido &&
          monstrosDaZona.find((zm) => zm.monstro && zm.monstro.nome === alvoPedido)) ||
        sortearMonstroDaZona(monstrosDaZona);

      const nivelSorteado = sortearNivelMonstro(escolhido, zona);
      const multiplicadores = {
        vida: escolhido.monstro.multiplicador_vida,
        dano: escolhido.monstro.multiplicador_dano,
        agilidade: escolhido.monstro.multiplicador_agilidade,
        velocidade: escolhido.monstro.multiplicador_velocidade,
      };
      const inimigo = gerarInimigo(jogadorEfetivo, escolhido.monstro.nome, {
        nivelForcado: nivelSorteado,
        multiplicadores,
      });

      // Snapshot dos atributos ESTRUTURAIS do personagem no exato momento
      // em que o encontro começa (força/vitalidade/etc já com bônus de
      // equipamento, arma equipada, defesa, multiplicadores de classe) —
      // sem isso, /combat/action recalculava esses valores A CADA TURNO a
      // partir do equipamento ATUAL, e o inimigo continuava calibrado pro
      // equipamento de quando foi gerado: trocar pra um equipamento mais
      // fraco só pra gerar um inimigo fácil e depois voltar ao
      // equipamento forte pra lutar (ou o inverso) virava trivial. Só HP/
      // mana atuais continuam vivos/atualizáveis turno a turno — o resto
      // fica congelado até o encontro terminar (vitória ou derrota).
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

      // Metadados da zona/monstro ficam junto no mesmo JSONB (§28-§30) —
      // é o que executarTurno usa depois pra decidir recompensa/espólio
      // de zona e atualizar os contadores da sessão (ver
      // adventureRewardService.js).
      character.encontro_pve = {
        ...inimigo,
        criadoEm: Date.now(),
        statsPersonagem,
        id_area: zona.id,
        id_monstro: escolhido.id_monstro,
        tipo_aparicao: escolhido.tipo_aparicao,
      };
      await character.save({ transaction });

      res.status(200).json({
        status: "success",
        data: {
          enemy: inimigo,
        },
      });
    });
  } catch (error) {
    console.error("Erro ao gerar inimigo:", error);

    res.status(500).json({
      message: "Erro interno do servidor ao gerar inimigo.",
    });
  }
};


exports.executarTurno = async (req, res) => {
  try {
    const characterId = req.personagemAtual.id;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        message:
          "Dados insuficientes para resolver o turno de combate.",
      });
    }

    // Uma única transação com o personagem travado (LOCK.UPDATE) cobre
    // o turno inteiro, do início ao fim: serializa qualquer segunda
    // requisição concorrente pra esse mesmo personagem (duplo clique,
    // duas abas) — ela só é atendida depois que esta transação
    // commitar, e nesse ponto já enxerga o encontro_pve atualizado (ou
    // ausente, se o combate já tiver terminado nesta primeira).
    return await sequelize.transaction(async (transaction) => {
      // Não precisa mais incluir Class aqui: os multiplicadores de
      // classe já vêm congelados em inimigoAtual.statsPersonagem (ver
      // processarTurno) — evita o join e a pegadinha de "FOR UPDATE"
      // não poder se aplicar ao lado nullable de um LEFT OUTER JOIN.
      const character = await Character.findByPk(characterId, {
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });

      if (!character) {
        return res.status(404).json({ message: "Personagem não encontrado." });
      }

      // O inimigo nunca vem do cliente — só o servidor sabe o estado
      // real (Character.encontro_pve). Qualquer `enemy` que o corpo da
      // requisição ainda contenha é ignorado de propósito.
      const inimigoAtual = encontroValido(character);
      if (!inimigoAtual) {
        return res.status(400).json({
          message:
            "Nenhum combate ativo para esse personagem. Busque um inimigo antes de atacar.",
        });
      }

      return await processarTurno({ req, res, character, inimigoAtual, transaction });
    });
  } catch (error) {
    console.error(
      "Erro ao processar turno de combate:",
      error
    );

    res.status(500).json({
      message:
        "Erro interno do servidor ao processar combate.",
    });
  }
};

async function processarTurno({ req, res, character, inimigoAtual, transaction }) {
  const { action } = req.body;
  const characterId = character.id;

    const log = [];

    // Atributos estruturais (força/vitalidade/arma equipada/defesa/
    // multiplicadores de classe) vêm do SNAPSHOT tirado quando o
    // encontro começou (ver gerarInimigoParaPersonagem) — NUNCA
    // recalculados do equipamento atual aqui. Só vida/mana atuais
    // continuam vindo do personagem de verdade, porque esses sim
    // precisam refletir o progresso real do combate turno a turno.
    // Encontros criados antes dessa mudança (sem statsPersonagem
    // salvo) caem no fallback de character.toJSON() puro — janela
    // curta e não reexplorável (só afeta uma luta já em andamento no
    // exato momento do deploy).
    const personagemAtual = {
      ...character.toJSON(),
      ...inimigoAtual.statsPersonagem,
      vida_atual: character.vida_atual,
      mana_atual: character.mana_atual,
    };

    // Mesma regeneração passiva do início do combate — evita bloquear
    // "derrotado" quem já regenerou o suficiente enquanto estava longe.
    // Só ajusta o objeto em memória aqui; a persistência acontece no(s)
    // save() mais abaixo, já dentro da mesma transação/lock.
    sincronizarRegeneracaoDeVida(character, personagemAtual);

    if (personagemAtual.vida_atual <= 0) {
      return res.status(400).json({
        message:
          "Este personagem está derrotado e precisa se recuperar.",
      });
    }

    // ==========================================================
    // TURNO DO JOGADOR
    // ==========================================================

    let poderUsado = null;
    let nivelHabilidadeUsada = 1;

    if (action.type === "power") {
      poderUsado = await Power.findByPk(action.powerId);

      if (!poderUsado) {
        return res.status(404).json({
          message: "Poder não encontrado.",
        });
      }

      const aprendeu = await CharacterAbilities.findOne({
        where: {
          id_personagem: characterId,
          id_power: poderUsado.id,
        },
      });

      if (!aprendeu) {
        return res.status(403).json({
          message:
            "Este personagem não aprendeu este poder.",
        });
      }

      // Poder passivo não é "usável" manualmente, e um poder desativado
      // (is_active: false) não pode ser disparado por um request forjado
      // direto na API — só a lista de poderes ativos escolhidos pelo
      // jogador conta.
      if (!aprendeu.is_active) {
        return res.status(403).json({
          message: "Este poder não está ativo para este personagem.",
        });
      }

      if (poderUsado.tipo_poder !== "Ativo") {
        return res.status(403).json({
          message: "Este poder não pode ser usado manualmente em combate.",
        });
      }

      nivelHabilidadeUsada = aprendeu.nivel_habilidade;

      if (
        personagemAtual.mana_atual <
        custoManaEfetivo(poderUsado, nivelHabilidadeUsada)
      ) {
        return res.status(400).json({
          message: "Mana insuficiente.",
        });
      }
    }

    // Consumível como ação de combate — a peça que faltava pro bloqueio
    // em characterInventoryController.js fazer sentido de verdade (antes
    // dele, "usar poção só como ação de combate" bloqueava a poção fora
    // do combate mas não abria nenhum jeito de usá-la DENTRO dele: o
    // jogador ficava sem cura nenhuma durante uma luta). Gasta o turno
    // igual um ataque ou poder — o inimigo ainda ataca depois.
    let inventoryEntry = null;
    let itemConsumivel = null;
    let efeitoConsumivel = null;

    if (action.type === "item") {
      inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: action.itemId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!inventoryEntry || inventoryEntry.quantidade < 1) {
        return res.status(400).json({
          message: "Você não possui esse item no inventário.",
        });
      }

      itemConsumivel = await Item.findByPk(action.itemId, { transaction });
      if (!itemConsumivel || itemConsumivel.tipo_item !== "Consumivel") {
        return res.status(400).json({
          message: "Este item não pode ser usado em combate.",
        });
      }

      efeitoConsumivel = await ConsumableProperties.findByPk(action.itemId, { transaction });
      if (!efeitoConsumivel) {
        return res.status(400).json({
          message: "Este item não possui efeito configurado.",
        });
      }
    }

    // ==========================================================
    // PODER
    // ==========================================================

    if (poderUsado) {
      personagemAtual.mana_atual -=
        custoManaEfetivo(poderUsado, nivelHabilidadeUsada);

      const { dano, cura } =
        calcularEfeitoPoder(
          poderUsado,
          personagemAtual,
          nivelHabilidadeUsada
        );

      if (dano > 0) {
        if (
          chanceDeEsquiva(
            inimigoAtual,
            personagemAtual
          )
        ) {
          log.push(
            `${inimigoAtual.nome} esquivou de ${poderUsado.nome}!`
          );
        } else {
          const danoMitigado = aplicarMitigacaoDeDefesa(dano, inimigoAtual);
          inimigoAtual.vida_atual = Math.max(
            0,
            inimigoAtual.vida_atual - danoMitigado
          );

          log.push(
            `Você usou ${poderUsado.nome} e causou ${danoMitigado} de dano em ${inimigoAtual.nome}.`
          );
        }
      }

      if (cura > 0) {
        personagemAtual.vida_atual = Math.min(
          vidaMaximaDe(personagemAtual),
          personagemAtual.vida_atual + cura
        );

        log.push(
          `Você usou ${poderUsado.nome} e recuperou ${cura} de vida.`
        );
      }
    }

    // ==========================================================
    // ITEM (consome o turno — não causa dano nenhum no inimigo)
    // ==========================================================

    else if (efeitoConsumivel) {
      // Mesma fórmula (percentual da vida/mana MÁXIMA, não pontos
      // fixos) do uso fora de combate em characterInventoryController.js
      // — usa vidaMaximaDe/manaMaximaDe sobre personagemAtual, que já
      // reflete o snapshot congelado do encontro (bônus de equipamento,
      // multiplicador de classe), pro valor curado bater com o mesmo
      // teto de vida/mana que o resto do combate está usando.
      if (efeitoConsumivel.efeito_vida) {
        const cura = Math.round(vidaMaximaDe(personagemAtual) * (efeitoConsumivel.efeito_vida / 100));
        personagemAtual.vida_atual = Math.min(
          vidaMaximaDe(personagemAtual),
          personagemAtual.vida_atual + cura,
        );
        log.push(`Você usou ${itemConsumivel.nome} e recuperou ${cura} de vida.`);
      }

      if (efeitoConsumivel.efeito_mana) {
        const curaMana = Math.round(manaMaximaDe(personagemAtual) * (efeitoConsumivel.efeito_mana / 100));
        personagemAtual.mana_atual = Math.min(
          manaMaximaDe(personagemAtual),
          personagemAtual.mana_atual + curaMana,
        );
        log.push(`Você usou ${itemConsumivel.nome} e recuperou ${curaMana} de mana.`);
      }

      inventoryEntry.quantidade -= 1;
      if (inventoryEntry.quantidade <= 0) {
        await inventoryEntry.destroy({ transaction });
      } else {
        await inventoryEntry.save({ transaction });
      }
    }

    // ==========================================================
    // ATAQUE BÁSICO
    // ==========================================================

    else {
      if (
        chanceDeEsquiva(
          inimigoAtual,
          personagemAtual
        )
      ) {
        log.push(
          `${inimigoAtual.nome} esquivou do seu ataque!`
        );
      } else {
        const dano = aplicarMitigacaoDeDefesa(
          calcularDanoBasico(personagemAtual),
          inimigoAtual,
        );

        inimigoAtual.vida_atual = Math.max(
          0,
          inimigoAtual.vida_atual - dano
        );

        log.push(
          `Você atacou e causou ${dano} de dano em ${inimigoAtual.nome}.`
        );
      }
    }

    // ==========================================================
    // CHECA VITÓRIA
    // ==========================================================

    if (inimigoAtual.vida_atual <= 0) {
      // Encontro do Modo Aventura (tem id_area, ver
      // gerarInimigoParaPersonagem) usa recompensa/espólio de ZONA
      // (§11/§12/§13), com contadores de sessão persistidos por kill
      // (§16) — nunca o pool genérico. Encontro antigo (sem id_area,
      // criado antes deste deploy) cai no fallback de sempre.
      const ehEncontroDeZona = Boolean(inimigoAtual.id_area);
      let xpGanho;
      let dinheiroGanho;
      let espolioDeZona = null;

      if (ehEncontroDeZona) {
        const recompensa = await concederRecompensaDeZona(character, inimigoAtual, transaction);
        xpGanho = recompensa.xpGanho;
        dinheiroGanho = recompensa.dinheiroGanho;
        espolioDeZona = recompensa.espolio;
      } else {
        xpGanho = 15 + inimigoAtual.nivel * 8;
        dinheiroGanho = 5 + inimigoAtual.nivel * 4;
      }

      // O personagem já está travado (LOCK.UPDATE) desde o início desta
      // mesma transação, em executarTurno — XP, dinheiro, vida, mana e o
      // fim do encontro saem todos num único save (dentro de
      // adicionarExperiencia), evitando perder uma recompensa se duas
      // vitórias do mesmo personagem forem processadas ao mesmo tempo
      // (double-click, duas abas).
      concederOuro(character, dinheiroGanho);
      character.vida_atual = personagemAtual.vida_atual;
      character.mana_atual = personagemAtual.mana_atual;
      character.ultima_atualizacao_vida = new Date();
      character.encontro_pve = null;
      const resultadoXP = await adicionarExperiencia(characterId, xpGanho, {
        transaction,
        personagem: character,
      });

      // Se houve level up, adiciona ao log.
      if (resultadoXP.niveisGanhos > 0) {
        for (
          let i = 1;
          i <= resultadoXP.niveisGanhos;
          i++
        ) {
          const nivelSubido =
            resultadoXP.nivel -
            resultadoXP.niveisGanhos +
            i;

          log.push(
            `Seu personagem subiu para o nível ${nivelSubido}!`
          );
        }
      }

      log.push(
        `${inimigoAtual.nome} foi derrotado! Você ganhou ${xpGanho} de experiência e ${dinheiroGanho} moedas.`
      );

      // Loot: rola DEPOIS do save de dinheiro/vida acima já estar
      // decidido em memória (character.dinheiro já tem dinheiroGanho
      // somado) — se cair ouro bônus, soma em cima do mesmo campo, e o
      // character.save() abaixo persiste tudo junto numa vez só.
      // Encontro de zona já resolveu o espólio próprio dentro de
      // concederRecompensaDeZona (§14 — Aventura não deve puxar do
      // mesmo pool genérico de Material/drop).
      const drop = ehEncontroDeZona
        ? null
        : await rolarDropDeVitoria(character, inimigoAtual, transaction);
      if (drop?.tipo === "item") {
        log.push(`Você encontrou: ${drop.item.nome}!`);
      } else if (drop?.tipo === "ouro") {
        log.push(`Você também encontrou ${drop.dinheiro} moedas extras!`);
      }
      if (espolioDeZona) {
        log.push(`Você recolheu: ${espolioDeZona.nome} x${espolioDeZona.quantidade}!`);
      }

      const dinheiroGanhoTotal = dinheiroGanho + (drop?.tipo === "ouro" ? drop.dinheiro : 0);
      await registrarProgresso(character, "MatarInimigos", 1, transaction);
      await registrarProgresso(character, "GanharOuro", dinheiroGanhoTotal, transaction);
      await registrarMorte(character.id, inimigoAtual.nome, transaction);
      await character.save({ transaction });

      return res.status(200).json({
        status: "success",

        data: {
          done: true,
          victory: true,

          log,

          character: {
            vida_atual:
              personagemAtual.vida_atual,

            mana_atual:
              personagemAtual.mana_atual,

            nivel:
              resultadoXP.nivel,

            experiencia:
              resultadoXP.experiencia,

            dinheiro: character.dinheiro,

            pontos_distribuir:
              resultadoXP.pontos_distribuir,
          },

          enemy: inimigoAtual,

          rewards: {
            experiencia: xpGanho,
            dinheiro: dinheiroGanho,
          },

          drop,
          espolio: espolioDeZona,
        },
      });
    }

    // ==========================================================
    // TURNO DO INIMIGO
    // ==========================================================

    if (
      chanceDeEsquiva(
        personagemAtual,
        inimigoAtual
      )
    ) {
      log.push(
        `Você esquivou do ataque de ${inimigoAtual.nome}!`
      );
    } else {
      const danoRecebido = aplicarMitigacaoDeDefesa(
        Math.max(
          1,
          Math.round(
            inimigoAtual.dano_base *
              (0.85 + Math.random() * 0.3)
          )
        ),
        personagemAtual,
      );

      personagemAtual.vida_atual =
        Math.max(
          0,
          personagemAtual.vida_atual -
            danoRecebido
        );

      log.push(
        `${inimigoAtual.nome} atacou e causou ${danoRecebido} de dano em você.`
      );
    }

    // ==========================================================
    // DERROTA DO PERSONAGEM
    // ==========================================================

    const derrotado =
      personagemAtual.vida_atual <= 0;

    if (derrotado) {
      log.push(
        "Você foi derrotado e precisa se recuperar antes de lutar de novo."
      );
    }

    character.vida_atual = derrotado ? 0 : personagemAtual.vida_atual;
    character.mana_atual = personagemAtual.mana_atual;
    character.ultima_atualizacao_vida = new Date();
    // Combate derrotado encerra o encontro (precisa buscar um novo
    // inimigo pra tentar de novo); senão, persiste o estado atualizado
    // do inimigo (vida restante) pro próximo turno.
    character.encontro_pve = derrotado ? null : inimigoAtual;
    await character.save({ transaction });

    return res.status(200).json({
      status: "success",

      data: {
        done: derrotado,
        victory: false,

        log,

        character: {
          vida_atual: derrotado
            ? 0
            : personagemAtual.vida_atual,

          mana_atual:
            personagemAtual.mana_atual,

          nivel: character.nivel,
          experiencia: character.experiencia,
          pontos_distribuir: character.pontos_distribuir,
        },

        enemy: inimigoAtual,
      },
    });
}