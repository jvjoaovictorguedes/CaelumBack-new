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
const { adicionarExperiencia } = require("../services/experienceService");
const {
  calcularDanoBasico,
  aplicarMitigacaoDeDefesa,
  calcularEfeitoPoder,
  chanceDeEsquiva,
  vidaMaximaDe,
  danoBasicoEsperado,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { sincronizarRegeneracaoDeVida } = require("../services/regenService");

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
const VALIDADE_ENCONTRO_MS = 30 * 60 * 1000;

// Expira sozinho depois de um tempo (encontro abandonado) — devolve uma
// CÓPIA do encontro válido (ou null), nunca a referência crua de
// character.encontro_pve: o resto do turno muta esse objeto in-place
// (inimigoAtual.vida_atual -= dano) conforme o combate avança, e se
// fosse a mesma referência guardada em character.dataValues, o
// Sequelize não detectaria diferença nenhuma na hora de reatribuir
// `character.encontro_pve = inimigoAtual` no final (mesmo objeto,
// "nada mudou" do ponto de vista do dirty-check) — o campo simplesmente
// não seria salvo.
function encontroValido(character) {
  const encontro = character.encontro_pve;
  if (!encontro) return null;
  if (Date.now() - encontro.criadoEm > VALIDADE_ENCONTRO_MS) return null;
  return { ...encontro };
}

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
function gerarInimigo(jogador) {
  const nivel = Math.max(1, jogador.nivel || 1);
  const variacao = () => 0.9 + Math.random() * 0.2; // ±10%

  const vidaJogador = vidaMaximaDe(jogador);
  const ataqueJogador = Math.max(1, danoBasicoEsperado(jogador));

  const vidaMaxima = Math.max(
    20,
    Math.round(ataqueJogador * RODADAS_PARA_MATAR_INIMIGO * variacao()),
  );
  const danoBase = Math.max(
    1,
    Math.round((vidaJogador / RODADAS_PARA_INIMIGO_MATAR_JOGADOR) * variacao()),
  );

  // Agilidade/velocidade espelham as do próprio jogador (com variação),
  // pra esquiva e ordem de turno ficarem parelhas com o que ele tem —
  // em vez de, de novo, assumir uma agilidade "média" pro nível.
  const agilidade = Math.max(1, Math.round((jogador.agilidade || 1) * variacao()));
  const velocidade = Math.max(1, Math.round((jogador.velocidade || 1) * variacao()));

  // forca/vitalidade do inimigo aqui são só pra manter o formato da
  // resposta (a API sempre devolveu esses campos) — quem decide o
  // resultado da luta é vida_maxima/dano_base calculados acima.
  const forca = Math.max(1, Math.round((danoBase - 3) / 0.7));
  const vitalidade = Math.max(1, Math.round((vidaMaxima - 20) / 5));

  return {
    nome: sortear(NOMES_INIMIGOS),
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
exports.gerarInimigoParaPersonagem = async (req, res) => {
  try {
    // Sempre o personagem do usuário autenticado, nunca o :characterId da
    // URL — mantido na rota só por compatibilidade, o valor em si é
    // ignorado.
    const character = await Character.findByPk(req.personagemAtual.id, {
      include: [{ model: Class }],
    });

    if (!character) {
      return res.status(404).json({
        message: "Personagem não encontrado.",
      });
    }

    const bonusEquipamento = await buscarBonusDeAtributos(character.id);
    const jogadorEfetivo = comMultiplicadoresDeClasse(
      personagemComBonus(character.toJSON(), bonusEquipamento),
      character.Class,
    );

    // Aplica a regeneração passiva acumulada antes de calibrar/entrar
    // em combate — sem isso, um jogador que ficou horas offline entrava
    // na luta com a vida velha (baixa), mesmo já tendo regenerado.
    if (sincronizarRegeneracaoDeVida(character, jogadorEfetivo)) {
      await character.save();
    }

    const inimigo = gerarInimigo(jogadorEfetivo);

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

    character.encontro_pve = { ...inimigo, criadoEm: Date.now(), statsPersonagem };
    await character.save();

    res.status(200).json({
      status: "success",
      data: {
        enemy: inimigo,
      },
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

      if (
        personagemAtual.mana_atual <
        poderUsado.custo_mana
      ) {
        return res.status(400).json({
          message: "Mana insuficiente.",
        });
      }
    }

    // ==========================================================
    // PODER
    // ==========================================================

    if (poderUsado) {
      personagemAtual.mana_atual -=
        poderUsado.custo_mana;

      const { dano, cura } =
        calcularEfeitoPoder(
          poderUsado,
          personagemAtual
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
      const xpGanho =
        15 + inimigoAtual.nivel * 8;

      const dinheiroGanho =
        5 + inimigoAtual.nivel * 4;

      // O personagem já está travado (LOCK.UPDATE) desde o início desta
      // mesma transação, em executarTurno — XP, dinheiro, vida, mana e o
      // fim do encontro saem todos num único save (dentro de
      // adicionarExperiencia), evitando perder uma recompensa se duas
      // vitórias do mesmo personagem forem processadas ao mesmo tempo
      // (double-click, duas abas).
      character.dinheiro += dinheiroGanho;
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