// src/controllers/characterController.js
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const MarketListing = require("../models/MarketListing");
const User = require("../models/User");
const Race = require("../models/Race");
const Class = require("../models/Class");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterEquipment = require("../models/CharacterEquipment");
const ClassAbilities = require("../models/ClassAbilities");
const RaceAbilities = require("../models/RaceAbilities");
const NatureAbilities = require("../models/NatureAbilities");
const CharacterAbilities = require("../models/CharacterAbilities");
const Evolution = require("../models/Evolution");
const CharacterEvolution = require("../models/CharacterEvolution");
const CharacterAdventureGuildProgress = require("../models/CharacterAdventureGuildProgress");
const CharacterHunterProgress = require("../models/CharacterHunterProgress");
const { formatarResumoReputacao } = require("../services/spoilReputationService");
const { formatarResumoReputacao: formatarResumoReputacaoCacador } = require("../services/hunterReputationService");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const { sortearNaturezaMagica } = require("../services/naturezaMagicaService");
const powerLearningService = require("../services/powerLearningService");
const {
  NOME_ITEM_FRAGMENTO,
  NIVEL_MAXIMO_HABILIDADE,
  MAX_HABILIDADES_ATIVAS_COMBATE,
  custoParaEvoluir,
  marcoDoNivel,
  multiplicadorEfeito,
  multiplicadorCustoMana,
} = require("../services/abilityLevelService");
const {
  listarCaminhosDaClasse,
  buscarCaminho,
} = require("../services/classEvolutionService");
const {
  avaliarRequisitosDaEvolucao,
  consumirRequisitosGastaveis,
} = require("../services/classEvolutionRequirementService");
const CharacterClassEvolution = require("../models/CharacterClassEvolution");
const {
  sincronizarRegeneracaoDeVidaEMana,
  msAteVidaRegenCompleta,
  msAteManaRegenCompleta,
} = require("../services/regenService");
const { vidaManaMaximaComTaverna } = require("../services/tavernBuffService");
const {
  PROPOSITO_RACA,
  PROPOSITO_CLASSE,
  verificarTicket: verificarTicketRaridade,
} = require("../services/raridadeRolagemService");

User.hasMany(Character, { foreignKey: "id_usuario" });
Character.belongsTo(User, { foreignKey: "id_usuario" });

Race.hasMany(Character, { foreignKey: "id_raca" });
Character.belongsTo(Race, { foreignKey: "id_raca" });

Class.hasMany(Character, { foreignKey: "id_classe" });
Character.belongsTo(Class, { foreignKey: "id_classe" });

Character.hasMany(CharacterEquipment, {
  foreignKey: "id_personagem",
  as: "equipamentos",
});
CharacterEquipment.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterEquipment.belongsTo(Item, { foreignKey: "id_item", as: "item" });

// ClassAbilities/RaceAbilities <-> Power nunca foram associadas de
// verdade em lugar nenhum (classAbilitiesController.js/raceAbilitiesController.js
// só têm a associação comentada) — sem isso, getPoderesDisponiveis (e os
// dois controllers antigos) derrubaria com "ClassAbilities is not
// associated to Power!" ao tentar `include: [{ model: Power }]`.
const Power = require("../models/Power");
ClassAbilities.belongsTo(Power, { foreignKey: "id_poder" });
RaceAbilities.belongsTo(Power, { foreignKey: "id_power" });
NatureAbilities.belongsTo(Power, { foreignKey: "id_poder" });
Evolution.belongsTo(Power, { foreignKey: "id_power_concedido", as: "poderConcedido" });

const CHARACTER_INCLUDES = [
  // Sem email aqui de propósito: esse include entra em toda leitura de
  // personagem (inclusive quando um jogador olha o personagem de outro,
  // ex.: alvo de PvP) — devolver email vazava o contato de qualquer
  // jogador pra qualquer outro.
  { model: User, attributes: ["id", "username"] },
  { model: Race },
  { model: Class },
  {
    model: CharacterEquipment,
    as: "equipamentos",
    include: [{ model: Item, as: "item" }],
  },
];

// Concede ao personagem os poderes de classe/raça já disponíveis no nível
// dele. Sem isso, personagem novo nascia sem nenhum poder aprendido —
// mesmo quando a classe/raça já tinha um poder configurado pra nível 1
// (ex: Mago aprende Cura Arcana, Celestial aprende Julgamento Divino) —
// e ficava restrito a ataque básico pra sempre, a menos que alguém
// chamasse POST /character-abilities manualmente.
async function concederPoderesIniciais(character) {
  const [poderesClasse, poderesRaca, poderesNatureza, aprendidos, evolucoesComPoder, evolucoesAdquiridas] = await Promise.all([
    ClassAbilities.findAll({
      where: {
        id_classe: character.id_classe,
        nivel_aprendizagem: { [Op.lte]: character.nivel },
        // custo_ouro marcado = precisa comprar na aba Habilidades, não
        // libera de graça só por bater o nível (ver comprarPoder).
        custo_ouro: { [Op.is]: null },
      },
    }),
    RaceAbilities.findAll({
      where: {
        id_raca: character.id_raca,
        nivel_aprendizado: { [Op.lte]: character.nivel },
        custo_ouro: { [Op.is]: null },
      },
    }),
    NatureAbilities.findAll({
      where: {
        natureza_magica: character.natureza_magica,
        nivel_aprendizagem: { [Op.lte]: character.nivel },
        custo_ouro: { [Op.is]: null },
      },
    }),
    CharacterAbilities.findAll({ where: { id_personagem: character.id } }),
    // Bug reportado: um poder de NatureAbilities que também é o
    // id_power_concedido de um nó da Árvore de Evolução daquela natureza
    // liberava de graça só por bater o nível, sem nunca precisar ter
    // adquirido a evolução — deixando a evolução opcional pro poder que
    // deveria ser o prêmio dela. Mesmo requisito aplicado em
    // getPoderesDisponiveis abaixo (pra quando custo_ouro NÃO é nulo).
    Evolution.findAll({
      where: { natureza_magica: character.natureza_magica, id_power_concedido: { [Op.ne]: null } },
      attributes: ["id", "id_power_concedido"],
    }),
    CharacterEvolution.findAll({ where: { id_personagem: character.id }, attributes: ["id_evolucao"] }),
  ]);

  const idEvolucaoPorPoder = new Map(evolucoesComPoder.map((e) => [e.id_power_concedido, e.id]));
  const idsEvolucoesAdquiridas = new Set(evolucoesAdquiridas.map((e) => e.id_evolucao));
  const poderesNaturezaLiberados = poderesNatureza.filter((poder) => {
    const idEvolucaoNecessaria = idEvolucaoPorPoder.get(poder.id_poder);
    return !idEvolucaoNecessaria || idsEvolucoesAdquiridas.has(idEvolucaoNecessaria);
  });

  // Concedidos de graça por nível são sempre "Ativo" (custo_ouro NULL
  // filtra os Passivos fora daqui) — sem esse limite, um personagem que
  // batesse vários níveis de uma vez (ou uma classe/raça com mais de
  // MAX_HABILIDADES_ATIVAS_COMBATE poderes) ganhava TODOS já marcados
  // pra combate de uma vez, furando o limite que
  // toggleCharacterAbility.jamais deixaria alcançar manualmente — é
  // exatamente o motivo de "aparece muito mais poder em combate do que
  // os 5 marcados" reportado depois do lote de poderes novos.
  const idsJaAprendidos = new Set(aprendidos.map((linha) => linha.id_power));
  let vagasAtivasRestantes = Math.max(
    0,
    MAX_HABILIDADES_ATIVAS_COMBATE - aprendidos.filter((linha) => linha.is_active).length,
  );

  const candidatos = [
    ...poderesClasse.map((poder) => ({ id_power: poder.id_poder, level_learned: poder.nivel_aprendizagem })),
    ...poderesRaca.map((poder) => ({ id_power: poder.id_power, level_learned: poder.nivel_aprendizado })),
    ...poderesNaturezaLiberados.map((poder) => ({ id_power: poder.id_poder, level_learned: poder.nivel_aprendizagem })),
  ].filter((candidato) => !idsJaAprendidos.has(candidato.id_power));

  const linhas = candidatos.map((candidato) => {
    const ativar = vagasAtivasRestantes > 0;
    if (ativar) vagasAtivasRestantes -= 1;
    return {
      id_personagem: character.id,
      id_power: candidato.id_power,
      level_learned: candidato.level_learned,
      is_active: ativar,
    };
  });

  if (linhas.length > 0) {
    await CharacterAbilities.bulkCreate(linhas, { ignoreDuplicates: true });
  }
}

exports.createCharacter = async (req, res) => {
  try {
    // Sempre o usuário autenticado — nunca o id_usuario que o corpo
    // mandar, senão qualquer um criava (ou "roubava" a criação de) um
    // personagem em nome de outra conta.
    const id_usuario = req.user.id;
    const { nome, genero, id_raca, id_classe, ticket_raca_rara, ticket_classe_rara } = req.body;
    if (!nome || !genero || !id_raca || !id_classe) {
      return res.status(400).json({
        message: "nome, genero, id_raca e id_classe são obrigatórios.",
      });
    }

    const jaTemPersonagem = await Character.findOne({ where: { id_usuario } });
    if (jaTemPersonagem) {
      return res.status(409).json({ message: "Sua conta já tem um personagem." });
    }

    const raca = await Race.findByPk(id_raca);
    if (!raca) {
      return res.status(400).json({ message: "Raça inválida." });
    }
    const classe = await Class.findByPk(id_classe);
    if (!classe) {
      return res.status(400).json({ message: "Classe inválida." });
    }

    // Raça/classe rara (Celestial/Primordial) só pode ser escolhida com
    // um ticket emitido pelo sorteio de verdade do servidor
    // (POST /races/sortear-raro, /classes/sortear-raro) — o cliente
    // nunca "ganha" a rara só mandando o id dela aqui.
    if (raca.raro && !verificarTicketRaridade(ticket_raca_rara, PROPOSITO_RACA, id_usuario, raca.id)) {
      return res.status(403).json({
        message: "Essa raça é rara e requer um sorteio válido para ser escolhida.",
      });
    }
    if (
      classe.raro &&
      !verificarTicketRaridade(ticket_classe_rara, PROPOSITO_CLASSE, id_usuario, classe.id)
    ) {
      return res.status(403).json({
        message: "Essa classe é rara e requer um sorteio válido para ser escolhida.",
      });
    }

    // Nível, dinheiro, atributos e vida/mana NUNCA vêm do corpo da
    // requisição: são sempre os valores iniciais fixos do jogo (nível 1,
    // 500 de ouro, 15 pontos de atributo pra distribuir) mais os bônus
    // da raça escolhida — sem isso, um cliente podia criar um
    // personagem já rico, de nível alto ou com atributos arbitrários só
    // editando o payload.
    const forca = raca.bonus_forca ?? 0;
    const vitalidade = raca.bonus_vitalidade ?? 0;
    const agilidade = raca.bonus_agilidade ?? 0;
    const inteligencia = raca.bonus_inteligencia ?? 0;
    const velocidade = raca.bonus_velocidade ?? 0;

    // vida_atual/mana_atual iniciais precisam do multiplicador da
    // Classe igual a vidaMaximaDe/manaMaximaDe usam em todo o resto do
    // jogo — sem isso, um Mago recém-criado nascia com vida_atual MAIOR
    // que o próprio vida_maxima calculado (o multiplicador 0.8 só
    // aparecia depois, na leitura), e um Guerreiro nascia com mana
    // sobrando que não deveria caber no teto dele (0.7).
    const personagemEfetivoInicial = comMultiplicadoresDeClasse(
      { nivel: 1, vitalidade, inteligencia },
      classe,
    );

    const newCharacter = await Character.create({
      id_usuario,
      nome,
      genero,
      id_raca,
      id_classe,
      // Sempre sorteada aqui — nunca a partir do que o cliente mandar,
      // senão qualquer um garantia a natureza rara só mandando o valor
      // certo no corpo da requisição.
      natureza_magica: sortearNaturezaMagica(),
      nivel: 1,
      experiencia: 0,
      dinheiro: 500,
      pontos_distribuir: 15,
      forca,
      vitalidade,
      agilidade,
      inteligencia,
      velocidade,
      vida_atual: vidaMaximaDe(personagemEfetivoInicial),
      mana_atual: manaMaximaDe(personagemEfetivoInicial),
    });

    try {
      await concederPoderesIniciais(newCharacter);
    } catch (erroPoderes) {
      // Não derruba a criação do personagem por causa disso — só loga.
      console.error(
        "Erro ao conceder poderes iniciais de classe/raça:",
        erroPoderes,
      );
    }

    res.status(201).json({
      status: "success",
      message: "Personagem criado com sucesso!",
      data: {
        character: newCharacter,
      },
    });
  } catch (error) {
    console.error("Erro ao criar personagem:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      // Cobre tanto a corrida de dois creates simultâneos pra mesma
      // conta (constraint em id_usuario, pega o que a checagem acima
      // não pegou por já ter passado) quanto o nome duplicado.
      const campoConflitante = error.errors?.[0]?.path;
      if (campoConflitante === "id_usuario") {
        return res
          .status(409)
          .json({ message: "Sua conta já tem um personagem." });
      }
      return res
        .status(409)
        .json({ message: "Já existe um personagem com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar personagem." });
  }
};

exports.getAllCharacters = async (req, res) => {
  try {
    const characters = await Character.findAll({
      include: CHARACTER_INCLUDES,
    });
    res.status(200).json({
      status: "success",
      results: characters.length,
      data: {
        characters,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagens:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagens." });
  }
};

exports.getCharacterByUserId = async (req, res) => {
  try {
    const character = await Character.findOne({
      where: { id_usuario: req.params.userId },
      include: CHARACTER_INCLUDES,
    });
    if (!character) {
      return res
        .status(404)
        .json({ message: "Este usuário ainda não possui um personagem." });
    }
    res.status(200).json({
      status: "success",
      data: {
        character,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem por usuário:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

// Monta a resposta "completa" de um personagem (poderes sincronizados,
// bônus de atributos, vida/mana efetivas com regeneração passiva
// aplicada). Compartilhado por getCharacterById (leitura por ID, com
// dono verificado por quem chama a rota) e getMeuPersonagem (leitura
// pelo JWT, sem depender de nenhum ID vindo do cliente).
async function carregarRespostaDoPersonagem(character) {
  // Sincroniza poderes de classe/raça toda vez que o personagem é
  // carregado — bulkCreate com ignoreDuplicates é seguro de chamar
  // repetidamente. Sem isso, um personagem criado antes de um poder
  // novo ser adicionado à classe (ex: Bola de Fogo pro Mago) nunca
  // aprendia esse poder, só quem criasse personagem depois.
  try {
    await concederPoderesIniciais(character);
  } catch (erroPoderes) {
    console.error("Erro ao sincronizar poderes iniciais:", erroPoderes);
  }

  const bonus_atributos = await buscarBonusDeAtributos(character.id);
  const personagemEfetivo = comMultiplicadoresDeClasse(
    personagemComBonus(character.toJSON(), bonus_atributos),
    character.Class,
  );

  // Regeneração passiva: calcula sob demanda quanto tempo real
  // passou desde a última mudança de vida/mana e aplica o que já
  // regenerou (cada uma com seu próprio relógio). Só grava no banco
  // quando há progresso de verdade.
  if (sincronizarRegeneracaoDeVidaEMana(character, personagemEfetivo)) {
    await character.save();
  }

  // Guilda não vinha em nenhuma resposta "privada" de personagem (só na
  // pública, /:id/public) — a aba de "dados do jogador" do front
  // precisa mostrar em qual guilda o próprio personagem está.
  const membroGuild = await GuildMember.findOne({
    where: { id_personagem: character.id },
    include: [{ model: Guild, attributes: ["id", "nome", "sigla"] }],
  });

  // Balcão de Espólios §12 / Caçadas §18 — progressões da Guilda dos
  // Aventureiros no perfil, sem criar linha à toa: quem nunca mexeu no
  // Balcão/Caçadas ainda não tem essas linhas, e o resumo deve mostrar
  // nível I / 0 pontos mesmo assim (nunca 404/undefined).
  const [progressoGuildaAventureiros, progressoCacador] = await Promise.all([
    CharacterAdventureGuildProgress.findOne({
      where: { id_personagem: character.id },
      attributes: ["reputacao_encomendas", "total_spoil_orders_completed"],
    }),
    CharacterHunterProgress.findOne({ where: { id_personagem: character.id } }),
  ]);
  const reputacaoComercial = formatarResumoReputacao(progressoGuildaAventureiros?.reputacao_encomendas ?? 0);
  const reputacaoCacador = formatarResumoReputacaoCacador(progressoCacador?.reputation_points ?? 0);

  // Taverna §13 — MAX_HP_PCT/MAX_MANA_PCT precisam aparecer na vida/mana
  // máxima que o jogador vê (era só usado no preview/execução do
  // Descanso da Taverna, então o buff parecia "não fazer nada" em
  // qualquer outra tela — bug reportado). Somado por cima do resultado
  // puro de vidaMaximaDe/manaMaximaDe, nunca substitui essas funções.
  const { vidaMaxima: vidaMaximaComBuff, manaMaxima: manaMaximaComBuff } = await vidaManaMaximaComTaverna(
    character.id,
    personagemEfetivo,
  );

  return {
    ...character.toJSON(),
    vida_atual: personagemEfetivo.vida_atual,
    mana_atual: personagemEfetivo.mana_atual,
    bonus_atributos,
    vida_maxima: vidaMaximaComBuff,
    mana_maxima: manaMaximaComBuff,
    regen_vida_restante_ms: msAteVidaRegenCompleta(personagemEfetivo),
    regen_mana_restante_ms: msAteManaRegenCompleta(personagemEfetivo),
    guilda: membroGuild?.Guild
      ? { id: membroGuild.Guild.id, nome: membroGuild.Guild.nome, sigla: membroGuild.Guild.sigla }
      : null,
    adventureGuildReputation: reputacaoComercial,
    // Caçadas §18 — resumo consolidado da Guilda dos Aventureiros pro
    // perfil (Rank + Reputação Comercial + Reputação de Caçador), sem
    // misturar o SIGNIFICADO das três progressões entre si.
    adventureGuildProfile: {
      adventurerRank: character.rank ?? "F",
      commercialReputation: {
        points: reputacaoComercial.points,
        level: reputacaoComercial.level,
        title: reputacaoComercial.name,
        ordersCompleted: progressoGuildaAventureiros?.total_spoil_orders_completed ?? 0,
      },
      hunterReputation: {
        points: reputacaoCacador.points,
        level: reputacaoCacador.level,
        title: reputacaoCacador.title,
        huntsCompleted: progressoCacador?.hunts_completed_total ?? 0,
        byDifficulty: {
          dangerous: progressoCacador?.hunts_completed_dangerous ?? 0,
          difficult: progressoCacador?.hunts_completed_difficult ?? 0,
          deadly: progressoCacador?.hunts_completed_deadly ?? 0,
          nightmare: progressoCacador?.hunts_completed_nightmare ?? 0,
          extermination: progressoCacador?.hunts_completed_extermination ?? 0,
        },
      },
    },
  };
}

// Dashboard V2 (doc "Dashboard V2 — Centro do Aventureiro") — a MESMA
// leitura completa que GET /me já usa (vida/mana máxima efetiva, XP,
// bônus de atributos, reputação, guilda...), reaproveitada pelo resumo
// agregado (dashboardSummaryService.js) sem duplicar nenhum cálculo.
// Carrega o personagem com os mesmos includes de GET /me internamente
// — quem chama só passa o id, nunca precisa saber de CHARACTER_INCLUDES.
exports.obterPersonagemCompletoParaResumo = async function obterPersonagemCompletoParaResumo(idPersonagem) {
  const character = await Character.findByPk(idPersonagem, { include: CHARACTER_INCLUDES });
  if (!character) return null;
  return carregarRespostaDoPersonagem(character);
};

// GET /api/characters/:id — dados COMPLETOS (dinheiro, vida, mana, XP,
// equipamento) de um personagem. Só o dono (ou um admin) pode ver isso —
// ver exigirDonoOuAdmin na rota. Pra ver dados de OUTRO jogador (perfil
// público, alvo de PvP, membro de guilda), use GET /:id/public abaixo.
exports.getCharacterById = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      include: CHARACTER_INCLUDES,
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    res.status(200).json({
      status: "success",
      data: { character: await carregarRespostaDoPersonagem(character) },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

// GET /api/characters/:id/public — versão enxuta, segura de expor pra
// QUALQUER jogador autenticado (nunca dinheiro/vida/mana/XP/inventário
// de outra conta). Sem checagem de dono de propósito — é isso que a
// torna diferente de getCharacterById.
exports.getCharacterPublico = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      attributes: ["id", "nome", "nivel", "genero", "rank"],
      include: [
        { model: Race, attributes: ["nome_masculino", "nome_feminino"] },
        { model: Class, attributes: ["nome"] },
      ],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const membroGuild = await GuildMember.findOne({
      where: { id_personagem: character.id },
      include: [{ model: Guild, attributes: ["id", "nome", "sigla"] }],
    });

    // Progresso da Guilda dos Aventureiros (Rank/Reputação Comercial/
    // Reputação de Caçador) é vitrine de jogador, igual nível ou guilda —
    // nada aqui expõe dinheiro/inventário/localização, então entra na
    // versão pública do mesmo jeito que carregarRespostaDoPersonagem já
    // monta pro dono em /characters/me e /:id (ver adventureGuildProfile).
    const [progressoGuildaAventureiros, progressoCacador] = await Promise.all([
      CharacterAdventureGuildProgress.findOne({
        where: { id_personagem: character.id },
        attributes: ["reputacao_encomendas", "total_spoil_orders_completed"],
      }),
      CharacterHunterProgress.findOne({ where: { id_personagem: character.id } }),
    ]);
    const reputacaoComercial = formatarResumoReputacao(progressoGuildaAventureiros?.reputacao_encomendas ?? 0);
    const reputacaoCacador = formatarResumoReputacaoCacador(progressoCacador?.reputation_points ?? 0);

    res.status(200).json({
      status: "success",
      data: {
        character: {
          id: character.id,
          nome: character.nome,
          nivel: character.nivel,
          genero: character.genero,
          rank: character.rank,
          raca: character.Race
            ? {
                nome_masculino: character.Race.nome_masculino,
                nome_feminino: character.Race.nome_feminino,
              }
            : null,
          classe: character.Class ? { nome: character.Class.nome } : null,
          guilda: membroGuild?.Guild
            ? { id: membroGuild.Guild.id, nome: membroGuild.Guild.nome, sigla: membroGuild.Guild.sigla }
            : null,
          adventureGuildProfile: {
            adventurerRank: character.rank ?? "F",
            commercialReputation: {
              points: reputacaoComercial.points,
              level: reputacaoComercial.level,
              title: reputacaoComercial.name,
              ordersCompleted: progressoGuildaAventureiros?.total_spoil_orders_completed ?? 0,
            },
            hunterReputation: {
              points: reputacaoCacador.points,
              level: reputacaoCacador.level,
              title: reputacaoCacador.title,
              huntsCompleted: progressoCacador?.hunts_completed_total ?? 0,
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem público:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

// GET /api/characters/me
// Identidade vem só do JWT (via carregarPersonagemAtual) — nenhum ID de
// personagem/usuário trafega no request. É o substituto recomendado
// pra depender do cookie characterId (que o cliente pode ler/editar)
// como se fosse identidade: aqui não tem como pedir o personagem de
// outra conta nem discordar do que o token diz.
exports.getMeuPersonagem = async (req, res) => {
  try {
    const character = await Character.findByPk(req.personagemAtual.id, {
      include: CHARACTER_INCLUDES,
    });

    // isAdmin só aqui (leitura do PRÓPRIO personagem), nunca em
    // CHARACTER_INCLUDES — esse include é reaproveitado por leituras de
    // personagens de OUTRAS contas (ex.: alvo de PvP), e vazar se o dono
    // de outro personagem é admin não é o objetivo aqui. Usado hoje pra
    // decidir se o frontend mostra o link de administração de Torneios
    // e, desde o Modo Manutenção, se isCurrentUserAdmin() reconhece um
    // admin que AINDA não tem personagem (a checagem de verdade
    // continua sendo o adminMiddleware em cada rota administrativa).
    // Lida ANTES do "!character" de propósito — bug real: um admin
    // sem personagem tomava 404 sem isAdmin nenhum no corpo, e
    // isCurrentUserAdmin() (que só lê esse campo) nunca tinha como
    // saber que era admin, ficando preso na tela de manutenção igual
    // um jogador comum.
    const usuario = await User.findByPk(req.user.id, { attributes: ["isAdmin"] });

    // Permissões granulares (Painel Administrativo §6/§8) — só
    // consultadas pra quem já é isAdmin; refletem sempre o banco, nunca
    // algo que o frontend possa forjar de volta numa próxima chamada.
    let adminPermissions = [];
    if (usuario?.isAdmin) {
      const [linhas] = await sequelize.query(
        `SELECT DISTINCT ap.chave
           FROM user_admin_roles uar
           JOIN admin_role_permissions arp ON arp.id_role = uar.id_role
           JOIN admin_permissions ap ON ap.id = arp.id_permission
          WHERE uar.id_user = :idUser;`,
        { replacements: { idUser: req.user.id } },
      );
      adminPermissions = linhas.map((l) => l.chave);
    }

    if (!character) {
      return res.status(404).json({
        message: "Você ainda não tem um personagem.",
        data: { isAdmin: Boolean(usuario?.isAdmin), adminPermissions },
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        character: await carregarRespostaDoPersonagem(character),
        isAdmin: Boolean(usuario?.isAdmin),
        adminPermissions,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem atual:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

// Avatares de perfil — ver avatarService.js pro catálogo completo
// (estáticos + enviados pelo admin) e a regra de quem pode usar qual.
const { avatarKeyPermitidoParaPersonagem, listarAvataresDisponiveis } = require("../services/avatarService");

// Único uso legítimo hoje é a troca de sexo (GenderToggleButton) e a
// troca de avatar (AvatarPickerModal). Sem uma lista explícita, esse
// PATCH aceitava qualquer coluna do modelo — dinheiro, nivel, stats,
// id_usuario — vindo direto do corpo da requisição.
const CAMPOS_EDITAVEIS = ["genero", "avatar_key"];

exports.updateCharacter = async (req, res) => {
  try {
    const dadosPermitidos = {};
    for (const campo of CAMPOS_EDITAVEIS) {
      if (req.body[campo] !== undefined) dadosPermitidos[campo] = req.body[campo];
    }
    if (Object.keys(dadosPermitidos).length === 0) {
      return res.status(400).json({ message: "Nenhum campo editável foi enviado." });
    }

    if (dadosPermitidos.avatar_key !== undefined && dadosPermitidos.avatar_key !== null) {
      const personagemAtual = await Character.findByPk(req.params.id, { include: CHARACTER_INCLUDES });
      if (!personagemAtual) {
        return res.status(404).json({ message: "Personagem não encontrado." });
      }
      const permitido = await avatarKeyPermitidoParaPersonagem(dadosPermitidos.avatar_key, personagemAtual);
      if (!permitido) {
        return res.status(400).json({ message: "Avatar inválido pra sua raça/classe." });
      }
    }

    const [updatedRows] = await Character.update(dadosPermitidos, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res.status(404).json({
        message: "Personagem não encontrado ou nenhum dado para atualizar.",
      });
    }

    const updatedCharacter = await Character.findByPk(req.params.id, {
      include: CHARACTER_INCLUDES,
    });
    res.status(200).json({
      status: "success",
      message: "Personagem atualizado com sucesso!",
      data: {
        character: updatedCharacter,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar personagem:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um personagem com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar personagem." });
  }
};

// GET /api/characters/:id/avatares-disponiveis — opções que ESSE
// personagem pode escolher no AvatarPickerModal (raças base livres +
// guerreiro/mago/celestial só se aplicável + avatares extras do admin
// já filtrados pela restrição de raça/classe deles). Nunca confiar só
// na validação do PATCH pra isso — o picker não deve nem mostrar opção
// que o servidor recusaria.
exports.getAvataresDisponiveis = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, { include: CHARACTER_INCLUDES });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }
    const avatares = await listarAvataresDisponiveis(character);
    res.status(200).json({ status: "success", data: avatares });
  } catch (error) {
    console.error("Erro ao listar avatares disponíveis:", error);
    res.status(500).json({ message: "Erro interno do servidor ao listar avatares." });
  }
};

const MAX_SLOTS_CONSUMIVEIS_COMBATE = 5;

// PATCH /api/characters/:id/combat-loadout/items — loadout de consumíveis
// pro combate (aba Combate, "Consumíveis em Combate"). 5 posições fixas;
// slot recebe id_item (precisa estar no inventário como Consumível) ou
// null pra esvaziar. O mesmo item não pode ocupar dois slots ao mesmo
// tempo — escolher um item que já está em outro slot MOVE ele pro slot
// novo em vez de duplicar.
exports.definirSlotConsumivelCombate = async (req, res) => {
  try {
    const { slot, id_item } = req.body;
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS_CONSUMIVEIS_COMBATE) {
      return res.status(400).json({
        message: `slot deve ser um número entre 0 e ${MAX_SLOTS_CONSUMIVEIS_COMBATE - 1}.`,
      });
    }
    if (id_item !== null && !Number.isInteger(id_item)) {
      return res.status(400).json({ message: "id_item deve ser um número ou null." });
    }

    const character = await Character.findByPk(req.params.id);
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    if (id_item !== null) {
      const noInventario = await CharacterInventory.findOne({
        where: { id_personagem: character.id, id_item },
        include: [{ model: Item, where: { tipo_item: "Consumivel" } }],
      });
      if (!noInventario) {
        return res.status(400).json({
          message: "Esse item não está no seu inventário como consumível.",
        });
      }
    }

    const slotsAtuais = Array.isArray(character.slots_consumiveis_combate)
      ? character.slots_consumiveis_combate
      : [];
    const slots = Array.from(
      { length: MAX_SLOTS_CONSUMIVEIS_COMBATE },
      (_, i) => slotsAtuais[i] ?? null,
    );

    if (id_item !== null) {
      for (let i = 0; i < slots.length; i += 1) {
        if (slots[i] === id_item) slots[i] = null;
      }
    }
    slots[slot] = id_item;

    character.slots_consumiveis_combate = slots;
    await character.save();

    res.status(200).json({
      status: "success",
      data: { slots_consumiveis_combate: slots },
    });
  } catch (error) {
    console.error("Erro ao definir slot de consumível de combate:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao definir slot de consumível." });
  }
};

// Lista TODOS os poderes de classe/raça do personagem (mesmo os que o
// nível ainda não libera) — a aba de Habilidades do front precisa
// mostrar os bloqueados também (só visualização, "requer nível X"), não
// só os já aprendidos. Poderes já aprendidos vêm com o estado
// aprendido/ativo de CharacterAbilities; os ainda não aprendidos vêm só
// com os dados do Power + nível necessário.
exports.getPoderesDisponiveis = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      attributes: ["id", "id_classe", "id_raca", "natureza_magica", "nivel", "dinheiro"],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    // Sincroniza antes de listar — mesmo motivo do carregarRespostaDoPersonagem:
    // garante que poderes já liberados pelo nível atual apareçam como
    // aprendidos, mesmo se essa for a primeira vez que o personagem é
    // carregado desde subir de nível.
    await concederPoderesIniciais(character);

    const [poderesClasse, poderesRaca, poderesNatureza, aprendidos, itemFragmento, evolucoesComPoder, evolucoesAdquiridas] = await Promise.all([
      ClassAbilities.findAll({
        where: { id_classe: character.id_classe },
        include: [{ model: Power }],
      }),
      RaceAbilities.findAll({
        where: { id_raca: character.id_raca },
        include: [{ model: Power }],
      }),
      NatureAbilities.findAll({
        where: { natureza_magica: character.natureza_magica },
        include: [{ model: Power }],
      }),
      CharacterAbilities.findAll({
        where: { id_personagem: character.id },
      }),
      Item.findOne({ where: { nome: NOME_ITEM_FRAGMENTO } }),
      // Bug reportado: um poder vinculado via NatureAbilities (admin
      // "vínculo Habilidade <-> Natureza Mágica") aparecia liberado pra
      // compra só por bater o nível — mesmo quando esse MESMO poder é o
      // id_power_concedido de um nó da Árvore de Evolução daquela
      // natureza, o que deixava completamente opcional (e fora de
      // ordem) uma habilidade que deveria ser o prêmio de evoluir.
      // Busca toda Evolution da natureza do personagem que concede
      // algum poder, pra casar com NatureAbilities abaixo.
      Evolution.findAll({
        where: { natureza_magica: character.natureza_magica, id_power_concedido: { [Op.ne]: null } },
        attributes: ["id", "nome", "id_power_concedido"],
      }),
      CharacterEvolution.findAll({
        where: { id_personagem: character.id },
        attributes: ["id_evolucao"],
      }),
    ]);

    // Mapa poder -> evolução que o concede (só considera a PRIMEIRA
    // evolução encontrada pra esse poder nessa natureza — na prática
    // nunca existe mais de uma, já que cada Evolution.id_power_concedido
    // é o "prêmio" de um nó específico).
    const evolucaoPorPoder = new Map(evolucoesComPoder.map((e) => [e.id_power_concedido, e]));
    const idsEvolucoesAdquiridas = new Set(evolucoesAdquiridas.map((e) => e.id_evolucao));

    const fragmentosDisponiveis = itemFragmento
      ? (
          await CharacterInventory.findOne({
            where: { id_personagem: character.id, id_item: itemFragmento.id },
          })
        )?.quantidade ?? 0
      : 0;

    const aprendidoPorPoder = new Map(
      aprendidos.map((linha) => [linha.id_power, linha]),
    );

    function montarEntrada(poder, nivelNecessario, origem, custoOuro, evolucaoRequerida) {
      const linhaAprendida = aprendidoPorPoder.get(poder.id);
      const evolucaoNaoAdquirida = Boolean(evolucaoRequerida) && !idsEvolucoesAdquiridas.has(evolucaoRequerida.id);
      const nivelHabilidade = linhaAprendida?.nivel_habilidade ?? 1;
      // Mostra o valor JÁ COM o multiplicador do nível da habilidade
      // aplicado (mesmo multiplicadorEfeito/multiplicadorCustoMana que
      // combatFormulas.calcularEfeitoPoder/custoManaEfetivo usam de
      // verdade no combate) — sem isso a tela sempre mostrava o
      // dano_base/cura_base/custo_mana CRU da tabela Power, então
      // evoluir a habilidade nunca parecia mudar nada aqui, mesmo o
      // combate já aplicando o bônus corretamente por baixo dos panos.
      const multiplicador = multiplicadorEfeito(nivelHabilidade);
      return {
        id_power: poder.id,
        nome: poder.nome,
        descricao: poder.descricao,
        tipo_poder: poder.tipo_poder,
        custo_mana: Math.round(poder.custo_mana * multiplicadorCustoMana(nivelHabilidade)),
        dano_base: poder.dano_base ? Math.round(poder.dano_base * multiplicador) : poder.dano_base,
        cura_base: poder.cura_base ? Math.round(poder.cura_base * multiplicador) : poder.cura_base,
        cooldown: poder.cooldown,
        escala_atributo: poder.escala_atributo,
        valor_escala: poder.valor_escala,
        imagem_url: poder.imagem_url,
        // Sistema de Proezas Únicas §9/§18 — badge "Legado Único" no
        // frontend depende disso pra saber quais Powers são exclusivos.
        acquisition_scope: poder.acquisition_scope,
        origem,
        nivel_necessario: nivelNecessario,
        aprendido: Boolean(linhaAprendida),
        ativo: linhaAprendida?.is_active ?? false,
        id_character_ability: linhaAprendida?.id ?? null,
        // custo_ouro = precisa comprar (não libera de graça por nível) —
        // pode_comprar só fica true quando falta comprar, o nível já foi
        // alcançado E (se houver) a evolução que concede esse mesmo
        // poder já foi adquirida, pra aba de Habilidades saber quando
        // mostrar o botão.
        custo_ouro: custoOuro ?? null,
        pode_comprar: !linhaAprendida && Boolean(custoOuro) && character.nivel >= nivelNecessario && !evolucaoNaoAdquirida,
        // Bug reportado: um poder vinculado à Natureza Mágica (admin)
        // que também é o prêmio de um nó da Árvore de Evolução daquela
        // natureza aparecia comprável só por nível, mesmo sem o
        // jogador ter adquirido a evolução — esses dois campos deixam a
        // aba de Habilidades mostrar a habilidade BLOQUEADA (não
        // escondida) com o nome da evolução que precisa adquirir antes.
        bloqueado_por_evolucao: evolucaoNaoAdquirida,
        evolucao_necessaria: evolucaoNaoAdquirida ? evolucaoRequerida.nome : null,
        // Nível 1-10 da habilidade em si (ver abilityLevelService.js) —
        // só faz sentido pra quem já aprendeu o poder.
        nivel_habilidade: linhaAprendida ? nivelHabilidade : null,
        nivel_maximo_habilidade: NIVEL_MAXIMO_HABILIDADE,
        marco_atual: linhaAprendida ? marcoDoNivel(nivelHabilidade) : null,
        proxima_evolucao: linhaAprendida ? custoParaEvoluir(nivelHabilidade) : null,
      };
    }

    // Sistema de Proezas Únicas §9 — um Legado é concedido via
    // CharacterAbilities DIRETO (uniqueFeatService.tryClaimAtomic),
    // nunca por ClassAbilities/RaceAbilities — sem isso, o Legado
    // conquistado nunca apareceria aqui pro jogador ativar (existiria
    // só no banco, invisível na própria tela de Habilidades).
    const idsJaListados = new Set([
      ...poderesClasse.map((linha) => linha.id_poder),
      ...poderesRaca.map((linha) => linha.id_power),
      ...poderesNatureza.map((linha) => linha.id_poder),
    ]);
    // Qualquer poder já aprendido (CharacterAbilities) que não veio de
    // ClassAbilities/RaceAbilities entra aqui — não só Legado Único
    // (UNIQUE_FEAT). Sem isso, poder concedido por Evolução de Classe
    // (ClassEvolutionAbility) ou por Evolução de Natureza Mágica
    // (Evolution.id_power_concedido) ficava gravado certinho em
    // CharacterAbilities mas NUNCA aparecia na aba Habilidades — o
    // jogador via a evolução dizer "concede tal poder" e o poder
    // simplesmente não existia pra ele na prática.
    const idsAprendidos = aprendidos.map((linha) => linha.id_power);
    const poderesExtras =
      idsAprendidos.length > 0
        ? await Power.findAll({ where: { id: idsAprendidos } })
        : [];

    const poderes = [
      ...poderesClasse.map((linha) =>
        montarEntrada(linha.Power, linha.nivel_aprendizagem, "classe", linha.custo_ouro),
      ),
      ...poderesRaca.map((linha) =>
        montarEntrada(linha.Power, linha.nivel_aprendizado, "raca", linha.custo_ouro),
      ),
      ...poderesNatureza.map((linha) =>
        montarEntrada(linha.Power, linha.nivel_aprendizagem, "natureza", linha.custo_ouro, evolucaoPorPoder.get(linha.id_poder)),
      ),
      ...poderesExtras
        .filter((poder) => !idsJaListados.has(poder.id))
        .map((poder) =>
          montarEntrada(poder, null, poder.acquisition_scope === "UNIQUE_FEAT" ? "legado" : "evolucao", null),
        ),
    ];

    res.status(200).json({
      status: "success",
      data: {
        poderes,
        recursos_evolucao: {
          ouro: character.dinheiro,
          fragmentos: fragmentosDisponiveis,
          nome_fragmento: NOME_ITEM_FRAGMENTO,
        },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar poderes disponíveis:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar poderes." });
  }
};

// Compra um poder marcado com custo_ouro (hoje só os Passivos novos) —
// diferente dos poderes de sempre, que concederPoderesIniciais libera de
// graça só por bater o nível, esses exigem essa compra explícita antes de
// entrarem em CharacterAbilities. Mesmo padrão de lock de comprarEvolucao
// (Character sempre existe, então travar ele direto já serializa duas
// compras simultâneas do mesmo poder).
exports.comprarPoder = async (req, res) => {
  try {
    const idPower = Number(req.params.idPower);

    const resultado = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }

      const [vinculoClasse, vinculoRaca, vinculoNatureza] = await Promise.all([
        ClassAbilities.findOne({
          where: { id_classe: character.id_classe, id_poder: idPower },
          transaction,
        }),
        RaceAbilities.findOne({
          where: { id_raca: character.id_raca, id_power: idPower },
          transaction,
        }),
        NatureAbilities.findOne({
          where: { natureza_magica: character.natureza_magica, id_poder: idPower },
          transaction,
        }),
      ]);
      const vinculo = vinculoClasse ?? vinculoRaca ?? vinculoNatureza;
      if (!vinculo) {
        throw Object.assign(
          new Error("Esse poder não pertence à classe/raça/natureza mágica deste personagem."),
          { statusCode: 404 },
        );
      }

      const nivelNecessario = vinculoClasse
        ? vinculo.nivel_aprendizagem
        : vinculoRaca
          ? vinculo.nivel_aprendizado
          : vinculo.nivel_aprendizagem;
      const custoOuro = vinculo.custo_ouro;
      if (!custoOuro) {
        throw Object.assign(
          new Error("Esse poder é liberado automaticamente pelo nível, não precisa comprar."),
          { statusCode: 400 },
        );
      }
      if (character.nivel < nivelNecessario) {
        throw Object.assign(new Error(`Esse poder exige nível ${nivelNecessario}.`), {
          statusCode: 400,
        });
      }

      // Mesma trava de getPoderesDisponiveis (onde isso vira
      // bloqueado_por_evolucao na resposta) — aqui no servidor é o que
      // IMPEDE de verdade comprar um poder vinculado à Natureza Mágica
      // que também é o prêmio de um nó da Árvore de Evolução, sem antes
      // ter adquirido essa evolução.
      if (vinculoNatureza) {
        const evolucaoQueConcede = await Evolution.findOne({
          where: { natureza_magica: character.natureza_magica, id_power_concedido: idPower },
          attributes: ["id", "nome"],
          transaction,
        });
        if (evolucaoQueConcede) {
          const jaAdquiriu = await CharacterEvolution.findOne({
            where: { id_personagem: character.id, id_evolucao: evolucaoQueConcede.id },
            transaction,
          });
          if (!jaAdquiriu) {
            throw Object.assign(
              new Error(`Esse poder é concedido pela evolução "${evolucaoQueConcede.nome}" — adquira essa evolução primeiro.`),
              { statusCode: 400 },
            );
          }
        }
      }

      const jaAprendido = await CharacterAbilities.findOne({
        where: { id_personagem: character.id, id_power: idPower },
        transaction,
      });
      if (jaAprendido) {
        throw Object.assign(new Error("Você já aprendeu esse poder."), { statusCode: 409 });
      }

      if (character.dinheiro < custoOuro) {
        throw Object.assign(new Error("Ouro insuficiente para comprar esse poder."), {
          statusCode: 400,
        });
      }

      character.dinheiro -= custoOuro;
      await character.save({ transaction });

      // Bug real reportado: comprar um poder Ativo aqui marcava
      // is_active:true sem checar MAX_HABILIDADES_ATIVAS_COMBATE (5) —
      // um personagem comprando poderes além do limite entrava em
      // combate com mais de 5 marcados, mesma causa raiz já corrigida
      // em concederPoderesIniciais/concederHabilidadesDeEvolucao (ver
      // comentário ali). Passivo nunca entra nessa conta (sempre ativo).
      const poderComprado = await Power.findByPk(idPower, { transaction });
      let podeAtivar = true;
      if (poderComprado?.tipo_poder === "Ativo") {
        const jaAtivas = await CharacterAbilities.count({
          where: { id_personagem: character.id, is_active: true },
          include: [{ model: Power, attributes: [], where: { tipo_poder: "Ativo" } }],
          transaction,
        });
        podeAtivar = jaAtivas < MAX_HABILIDADES_ATIVAS_COMBATE;
      }

      const characterAbility = await CharacterAbilities.create(
        {
          id_personagem: character.id,
          id_power: idPower,
          level_learned: nivelNecessario,
          is_active: podeAtivar,
        },
        { transaction },
      );

      return { characterAbility, dinheiro: character.dinheiro };
    });

    res.status(201).json({
      status: "success",
      data: resultado,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Erro ao comprar poder:", error);
    res.status(500).json({ message: "Erro interno do servidor ao comprar poder." });
  }
};

// POST /characters/:id/power-books/:idItem/learn (Habilidades V2.0 §13)
// — usa um Livro de Habilidade do inventário pra aprender permanentemente
// a Power vinculada. Toda a validação/concessão vive em
// powerLearningService; aqui é só tradução HTTP.
exports.aprenderPorLivroDeHabilidade = async (req, res) => {
  try {
    const characterId = Number(req.params.id);
    const idItem = Number(req.params.idItem);
    const resultado = await powerLearningService.aprenderPorLivro(characterId, idItem);
    res.status(201).json({ status: "success", data: resultado });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Erro ao aprender por Livro de Habilidade:", error);
    res.status(500).json({ message: "Erro interno do servidor ao aprender por Livro de Habilidade." });
  }
};

// Lista a árvore de evolução do personagem: toda Evolution cadastrada
// pra classe+natureza mágica dele (a feature nasceu pensada no Mago,
// mas a query já é genérica por classe — outras classes usam quando
// tiverem evoluções cadastradas), cruzada com o que ele já comprou.
// `id_evolucao_pre_requisito` vem junto pra o front desenhar a árvore
// (cada nó aponta pro pai) — "mostrando pra ele onde ele pode chegar".
exports.getEvolucoesDisponiveis = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      attributes: ["id", "id_classe", "natureza_magica", "nivel", "dinheiro"],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const [evolucoes, compradas] = await Promise.all([
      Evolution.findAll({
        where: { id_classe: character.id_classe, natureza_magica: character.natureza_magica },
        include: [{ model: Power, as: "poderConcedido", attributes: ["id", "nome", "tipo_poder"] }],
        order: [["ordem", "ASC"]],
      }),
      CharacterEvolution.findAll({ where: { id_personagem: character.id } }),
    ]);

    const idsComprados = new Set(compradas.map((linha) => linha.id_evolucao));

    const arvore = evolucoes.map((evolucao) => {
      const comprada = idsComprados.has(evolucao.id);
      const preRequisitoAtendido =
        !evolucao.id_evolucao_pre_requisito || idsComprados.has(evolucao.id_evolucao_pre_requisito);
      const nivelAtendido = character.nivel >= evolucao.nivel_necessario;
      const dinheiroSuficiente = character.dinheiro >= evolucao.custo;

      return {
        id: evolucao.id,
        nome: evolucao.nome,
        descricao: evolucao.descricao,
        natureza_magica: evolucao.natureza_magica,
        nivel_necessario: evolucao.nivel_necessario,
        custo: evolucao.custo,
        bonus_forca: evolucao.bonus_forca,
        bonus_vitalidade: evolucao.bonus_vitalidade,
        bonus_agilidade: evolucao.bonus_agilidade,
        bonus_inteligencia: evolucao.bonus_inteligencia,
        bonus_velocidade: evolucao.bonus_velocidade,
        poder_concedido: evolucao.poderConcedido
          ? { id: evolucao.poderConcedido.id, nome: evolucao.poderConcedido.nome, tipo_poder: evolucao.poderConcedido.tipo_poder }
          : null,
        id_evolucao_pre_requisito: evolucao.id_evolucao_pre_requisito,
        imagem_url: evolucao.imagem_url,
        comprada,
        pode_comprar: !comprada && preRequisitoAtendido && nivelAtendido && dinheiroSuficiente,
        pre_requisito_atendido: preRequisitoAtendido,
        nivel_atendido: nivelAtendido,
        dinheiro_suficiente: dinheiroSuficiente,
      };
    });

    res.status(200).json({
      status: "success",
      data: { natureza_magica: character.natureza_magica, evolucoes: arvore },
    });
  } catch (error) {
    console.error("Erro ao buscar evoluções disponíveis:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar evoluções." });
  }
};

// Compra uma evolução: debita o custo em dinheiro, aplica o bônus de
// atributo direto nas colunas do personagem (mesmo mecanismo de
// attributeController.js — permanente, não recalculado por bônus de
// equipamento) e concede o poder associado (se houver), do mesmo jeito
// que concederPoderesIniciais faz pra poder de classe/raça.
exports.comprarEvolucao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }

      const evolucao = await Evolution.findByPk(req.params.evolutionId, { transaction });
      if (!evolucao) {
        throw Object.assign(new Error("Evolução não encontrada."), { statusCode: 404 });
      }

      if (evolucao.id_classe !== character.id_classe) {
        throw Object.assign(
          new Error("Essa evolução não pertence à classe deste personagem."),
          { statusCode: 400 },
        );
      }
      if (evolucao.natureza_magica !== character.natureza_magica) {
        throw Object.assign(
          new Error("Essa evolução não é compatível com a natureza mágica deste personagem."),
          { statusCode: 400 },
        );
      }
      if (character.nivel < evolucao.nivel_necessario) {
        throw Object.assign(
          new Error(`Esta evolução exige nível ${evolucao.nivel_necessario}.`),
          { statusCode: 400 },
        );
      }

      const jaComprada = await CharacterEvolution.findOne({
        where: { id_personagem: character.id, id_evolucao: evolucao.id },
        transaction,
      });
      if (jaComprada) {
        throw Object.assign(new Error("Esta evolução já foi adquirida."), { statusCode: 409 });
      }

      if (evolucao.id_evolucao_pre_requisito) {
        const preRequisitoComprado = await CharacterEvolution.findOne({
          where: { id_personagem: character.id, id_evolucao: evolucao.id_evolucao_pre_requisito },
          transaction,
        });
        if (!preRequisitoComprado) {
          throw Object.assign(
            new Error("É preciso adquirir a evolução anterior desta árvore primeiro."),
            { statusCode: 400 },
          );
        }
      }

      if (character.dinheiro < evolucao.custo) {
        throw Object.assign(new Error("Moedas insuficientes para esta evolução."), {
          statusCode: 400,
        });
      }

      character.dinheiro -= evolucao.custo;
      character.forca += evolucao.bonus_forca;
      character.vitalidade += evolucao.bonus_vitalidade;
      character.agilidade += evolucao.bonus_agilidade;
      character.inteligencia += evolucao.bonus_inteligencia;
      character.velocidade += evolucao.bonus_velocidade;
      await character.save({ transaction });

      await CharacterEvolution.create(
        { id_personagem: character.id, id_evolucao: evolucao.id },
        { transaction },
      );

      if (evolucao.id_power_concedido) {
        // Mesmo bug/mesma correção de comprarPoder acima: um poder Ativo
        // concedido por Evolução de Natureza/Classe nunca pode furar
        // MAX_HABILIDADES_ATIVAS_COMBATE (5). Passivo fica de fora da
        // conta (sempre ativo).
        const poderConcedido = await Power.findByPk(evolucao.id_power_concedido, { transaction });
        let podeAtivar = true;
        if (poderConcedido?.tipo_poder === "Ativo") {
          const jaAtivas = await CharacterAbilities.count({
            where: { id_personagem: character.id, is_active: true },
            include: [{ model: Power, attributes: [], where: { tipo_poder: "Ativo" } }],
            transaction,
          });
          podeAtivar = jaAtivas < MAX_HABILIDADES_ATIVAS_COMBATE;
        }

        await CharacterAbilities.findOrCreate({
          where: { id_personagem: character.id, id_power: evolucao.id_power_concedido },
          defaults: {
            id_personagem: character.id,
            id_power: evolucao.id_power_concedido,
            level_learned: character.nivel,
            is_active: podeAtivar,
          },
          transaction,
        });
      }

      return character;
    });

    res.status(200).json({
      status: "success",
      message: "Evolução adquirida com sucesso!",
      data: {
        character: {
          dinheiro: resultado.dinheiro,
          forca: resultado.forca,
          vitalidade: resultado.vitalidade,
          agilidade: resultado.agilidade,
          inteligencia: resultado.inteligencia,
          velocidade: resultado.velocidade,
        },
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao comprar evolução:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao comprar evolução." });
  }
};

// GET a árvore de evolução de CLASSE — Classes V2 §5: dois estágios,
// Lv.40 (1) e Lv.100 (2). O jogador escolhe UM caminho de estágio 1 em
// definitivo; se aquele caminho tiver filhos ativos (id_evolucao_pai),
// o estágio 2 libera exclusivamente entre eles (§5.2 "não existe
// Berserker -> Ascensão Paladino"). Requisitos vêm inteiramente de
// ClassEvolutionRequirement agora (classEvolutionRequirementService),
// nunca mais das colunas ad hoc de ClassEvolutionPath — essas continuam
// no banco só como histórico dos caminhos publicados antes da Fase 2.
// Não confundir com getEvolucoesDisponiveis (Evolution por natureza
// mágica, sistema à parte).
exports.getEvolucaoDeClasse = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      attributes: ["id", "nivel", "id_classe", "id_evolucao_classe", "dinheiro", "rank"],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const caminhos = await listarCaminhosDaClasse(character.id_classe);
    const caminhosAtivos = caminhos.filter((c) => c.ativo);
    if (caminhosAtivos.length === 0) {
      return res.status(200).json({ status: "success", data: { disponivel: false } });
    }

    const evolucoesAdquiridas = await CharacterClassEvolution.findAll({
      where: { id_personagem: character.id },
    });
    const adquiridaPorEstagio = new Map(evolucoesAdquiridas.map((e) => [e.estagio, e]));
    const adquiridaEstagio1 = adquiridaPorEstagio.get(1) ?? null;
    const adquiridaEstagio2 = adquiridaPorEstagio.get(2) ?? null;

    async function montarOpcao(caminho) {
      const { atendidos, detalhes } = await avaliarRequisitosDaEvolucao(caminho.id, character);
      return {
        id: caminho.id,
        nome: caminho.nome,
        descricao: caminho.descricao,
        estagio: caminho.estagio,
        id_evolucao_pai: caminho.id_evolucao_pai,
        icone_url: caminho.icone_url,
        imagem_url: caminho.imagem_url,
        bonus_forca: caminho.bonus_forca,
        bonus_vitalidade: caminho.bonus_vitalidade,
        bonus_agilidade: caminho.bonus_agilidade,
        bonus_inteligencia: caminho.bonus_inteligencia,
        bonus_velocidade: caminho.bonus_velocidade,
        requisitos: detalhes,
        atende_requisitos: atendidos,
      };
    }

    const opcoesEstagio1 = await Promise.all(
      caminhosAtivos.filter((c) => c.estagio === 1).map(montarOpcao),
    );
    const filhosDoEscolhido = adquiridaEstagio1
      ? caminhosAtivos.filter((c) => c.estagio === 2 && c.id_evolucao_pai === adquiridaEstagio1.id_evolucao)
      : [];
    const opcoesEstagio2 = await Promise.all(filhosDoEscolhido.map(montarOpcao));

    const caminhoPorId = new Map(caminhos.map((c) => [c.id, c]));

    res.status(200).json({
      status: "success",
      data: {
        disponivel: true,
        nivel_atual: character.nivel,
        dinheiro_atual: character.dinheiro,
        estagio_1: {
          adquirida: Boolean(adquiridaEstagio1),
          caminho_escolhido_id: adquiridaEstagio1?.id_evolucao ?? null,
          caminho_escolhido_nome: adquiridaEstagio1 ? caminhoPorId.get(adquiridaEstagio1.id_evolucao)?.nome ?? null : null,
          opcoes: opcoesEstagio1,
        },
        estagio_2: {
          // Só existe "disponível" de verdade quando o caminho de
          // estágio 1 escolhido TEM filhos cadastrados — uma classe
          // pode não ter estágio 2 ainda (§5 "schema preparado pra
          // estágios futuros", não obrigatório publicar de cara).
          disponivel: filhosDoEscolhido.length > 0,
          adquirida: Boolean(adquiridaEstagio2),
          caminho_escolhido_id: adquiridaEstagio2?.id_evolucao ?? null,
          caminho_escolhido_nome: adquiridaEstagio2 ? caminhoPorId.get(adquiridaEstagio2.id_evolucao)?.nome ?? null : null,
          opcoes: opcoesEstagio2,
        },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar evolução de classe:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar evolução de classe." });
  }
};

// Classes V2 §9 — concede os Powers configurados em ClassEvolutionAbility
// pra essa evolução (auto_conceder=true), respeitando o limite de 5
// habilidades ativas em combate (ativar_se_houver_slot) — mesmo padrão
// de concederPoderesIniciais acima. UNIQUE_FEAT nunca é concedido por
// aqui (§9 "validar server-side"): mesmo que um vínculo assim exista
// por engano, é pulado silenciosamente, nunca concedido.
async function concederHabilidadesDeEvolucao(character, idEvolucao, transaction) {
  const ClassEvolutionAbility = require("../models/ClassEvolutionAbility");
  const vinculos = await ClassEvolutionAbility.findAll({
    where: { id_evolucao: idEvolucao, auto_conceder: true },
    transaction,
  });
  if (vinculos.length === 0) return;

  const [powers, aprendidos] = await Promise.all([
    Power.findAll({ where: { id: vinculos.map((v) => v.id_power) }, transaction }),
    CharacterAbilities.findAll({ where: { id_personagem: character.id }, transaction }),
  ]);
  const powerPorId = new Map(powers.map((p) => [p.id, p]));
  const idsJaAprendidos = new Set(aprendidos.map((linha) => linha.id_power));
  let vagasAtivasRestantes = Math.max(
    0,
    MAX_HABILIDADES_ATIVAS_COMBATE - aprendidos.filter((linha) => linha.is_active).length,
  );

  const linhas = [];
  for (const vinculo of vinculos) {
    if (idsJaAprendidos.has(vinculo.id_power)) continue;
    const power = powerPorId.get(vinculo.id_power);
    if (!power || power.acquisition_scope === "UNIQUE_FEAT") continue;
    const ativar = vinculo.ativar_se_houver_slot && vagasAtivasRestantes > 0;
    if (ativar) vagasAtivasRestantes -= 1;
    linhas.push({ id_personagem: character.id, id_power: vinculo.id_power, level_learned: character.nivel, is_active: ativar });
  }
  if (linhas.length > 0) {
    await CharacterAbilities.bulkCreate(linhas, { ignoreDuplicates: true, transaction });
  }
}

// POST escolhe UM caminho da árvore de classe (body: { id_caminho }) —
// serve tanto pro estágio 1 (Lv.40) quanto pro estágio 2 (Lv.100): o
// próprio caminho já diz o estágio dele (§23.1/23.2 do documento, um
// único fluxo transacional pros dois casos, diferindo só na checagem de
// linhagem). Consome os requisitos gastáveis (ouro/item), é definitivo
// (sem desevoluir nem trocar de caminho depois).
exports.evolveClass = async (req, res) => {
  try {
    const idCaminho = Number(req.body?.id_caminho);
    if (!Number.isInteger(idCaminho)) {
      return res.status(400).json({ message: "id_caminho é obrigatório." });
    }

    const resultado = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }

      const caminho = await buscarCaminho(idCaminho);
      if (!caminho || !caminho.ativo || caminho.id_classe !== character.id_classe) {
        throw Object.assign(
          new Error("Esse caminho de evolução não pertence à classe deste personagem."),
          { statusCode: 404 },
        );
      }

      const evolucoesAtuais = await CharacterClassEvolution.findAll({
        where: { id_personagem: character.id },
        transaction,
      });
      const adquiridaEstagio1 = evolucoesAtuais.find((e) => e.estagio === 1) ?? null;
      const adquiridaNoEstagioAlvo = evolucoesAtuais.find((e) => e.estagio === caminho.estagio);
      if (adquiridaNoEstagioAlvo) {
        throw Object.assign(new Error(`Este personagem já concluiu o estágio ${caminho.estagio} de evolução de classe.`), {
          statusCode: 409,
        });
      }

      // §5.2 — linhagem: estágio 2 exige a evolução PAI (mesma que o
      // personagem escolheu no estágio 1) já adquirida; nunca aceita um
      // filho de um caminho de estágio 1 diferente do escolhido.
      if (caminho.estagio > 1) {
        if (!adquiridaEstagio1) {
          throw Object.assign(new Error("Complete o estágio 1 de evolução de classe antes deste."), { statusCode: 400 });
        }
        if (caminho.id_evolucao_pai !== adquiridaEstagio1.id_evolucao) {
          throw Object.assign(
            new Error("Esse caminho de estágio 2 não pertence à linhagem que você escolheu no estágio 1."),
            { statusCode: 400 },
          );
        }
      }

      const { atendidos, detalhes } = await avaliarRequisitosDaEvolucao(caminho.id, character, transaction);
      if (!atendidos) {
        const faltando = detalhes.find((d) => !d.atendido);
        throw Object.assign(
          new Error(`Requisito não cumprido pra evoluir pra ${caminho.nome} (${faltando?.tipo ?? "requisito"}).`),
          { statusCode: 400 },
        );
      }
      await consumirRequisitosGastaveis(caminho.id, character, transaction);
      await character.save({ transaction });

      // Classes V2 §7 — o bônus da evolução NUNCA é somado diretamente
      // nos atributos-base do Character; fica registrado em
      // CharacterClassEvolution e resolvido dinamicamente por
      // classEvolutionBonusService (via equipmentBonusService, mesma
      // filosofia de equipamento/passivas/sets). id_evolucao_classe
      // continua sendo escrito só no estágio 1, só como ponteiro de
      // leitura/compat com o runtime V1 — nunca fonte de bônus.
      if (caminho.estagio === 1) {
        character.id_evolucao_classe = caminho.id;
        await character.save({ transaction });
      }
      await CharacterClassEvolution.create(
        { id_personagem: character.id, id_evolucao: caminho.id, estagio: caminho.estagio, legacy_bonus_materializado: false },
        { transaction },
      );
      await concederHabilidadesDeEvolucao(character, caminho.id, transaction);

      return { character, nomeEvoluido: caminho.nome, estagio: caminho.estagio };
    });

    res.status(200).json({
      status: "success",
      message: `Seu personagem evoluiu para ${resultado.nomeEvoluido}!`,
      data: {
        estagio: resultado.estagio,
        id_evolucao_classe: resultado.character.id_evolucao_classe,
        nome_evoluido: resultado.nomeEvoluido,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao evoluir de classe:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao evoluir de classe." });
  }
};

exports.deleteCharacter = async (req, res) => {
  try {
    await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }

      // Guild.id_fundador/id_lider referenciam Characters sem
      // onDelete configurado (NO ACTION) — excluir o líder/fundador de
      // qualquer guilda (não só Ativa; a FK não distingue status)
      // deixava a regra da guilda inconsistente (quem lidera uma
      // guilda sem dono?) e, sem essa checagem, só estourava como erro
      // 500 genérico de violação de chave estrangeira na hora do DELETE.
      const guildComoLiderOuFundador = await Guild.findOne({
        where: {
          [Op.or]: [{ id_fundador: character.id }, { id_lider: character.id }],
        },
        transaction,
      });
      if (guildComoLiderOuFundador) {
        throw Object.assign(
          new Error(
            "Transfira a liderança ou dissolva a guilda antes de excluir o personagem.",
          ),
          { statusCode: 409 },
        );
      }

      // Mesmo problema de FK pra um membro comum (GuildMember.id_personagem
      // também referencia Characters sem onDelete) — sai da guilda antes
      // de excluir, em vez de deixar qualquer membro de guilda nem
      // conseguir excluir o próprio personagem.
      await GuildMember.destroy({ where: { id_personagem: character.id }, transaction });

      // Mesmo racional de adminUserService.excluirUmUsuario:
      // market_listings.id_instancia é RESTRICT de propósito (protege
      // contra apagar sem querer um item ainda anunciado), mas aqui o
      // personagem inteiro está sendo excluído — qualquer anúncio dele
      // precisa sumir junto, não bloquear a exclusão da instância.
      await MarketListing.destroy({ where: { id_personagem_vendedor: character.id }, transaction });

      await character.destroy({ transaction });
    });

    res.status(204).json({
      status: "success",
      message: "Personagem deletado com sucesso!",
      data: null,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao deletar personagem:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao deletar personagem." });
  }
};
