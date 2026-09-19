// src/controllers/characterController.js
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const User = require("../models/User");
const Race = require("../models/Race");
const Class = require("../models/Class");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterEquipment = require("../models/CharacterEquipment");
const ClassAbilities = require("../models/ClassAbilities");
const RaceAbilities = require("../models/RaceAbilities");
const CharacterAbilities = require("../models/CharacterAbilities");
const Evolution = require("../models/Evolution");
const CharacterEvolution = require("../models/CharacterEvolution");
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
const {
  NOME_ITEM_FRAGMENTO,
  NIVEL_MAXIMO_HABILIDADE,
  custoParaEvoluir,
  marcoDoNivel,
  multiplicadorEfeito,
  multiplicadorCustoMana,
} = require("../services/abilityLevelService");
const {
  listarCaminhosDaClasse,
  buscarCaminho,
  buscarItemRequisito,
  contarMortesDoAlvo,
} = require("../services/classEvolutionService");
const { sincronizarRegeneracaoDeVida, msAteRegenCompleta } = require("../services/regenService");
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
  const [poderesClasse, poderesRaca] = await Promise.all([
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
  ]);

  const linhas = [
    ...poderesClasse.map((poder) => ({
      id_personagem: character.id,
      id_power: poder.id_poder,
      level_learned: poder.nivel_aprendizagem,
      is_active: true,
    })),
    ...poderesRaca.map((poder) => ({
      id_personagem: character.id,
      id_power: poder.id_power,
      level_learned: poder.nivel_aprendizado,
      is_active: true,
    })),
  ];

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
    // 15 de ouro) mais os bônus da raça escolhida — sem isso, um cliente
    // podia criar um personagem já rico, de nível alto ou com atributos
    // arbitrários só editando o payload.
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
      dinheiro: 15,
      pontos_distribuir: 0,
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
  // passou desde a última mudança de vida e aplica o que já
  // regenerou. Só grava no banco quando há progresso de verdade.
  if (sincronizarRegeneracaoDeVida(character, personagemEfetivo)) {
    await character.save();
  }

  // Guilda não vinha em nenhuma resposta "privada" de personagem (só na
  // pública, /:id/public) — a aba de "dados do jogador" do front
  // precisa mostrar em qual guilda o próprio personagem está.
  const membroGuild = await GuildMember.findOne({
    where: { id_personagem: character.id },
    include: [{ model: Guild, attributes: ["id", "nome", "sigla"] }],
  });

  return {
    ...character.toJSON(),
    vida_atual: personagemEfetivo.vida_atual,
    bonus_atributos,
    vida_maxima: vidaMaximaDe(personagemEfetivo),
    mana_maxima: manaMaximaDe(personagemEfetivo),
    regen_vida_restante_ms: msAteRegenCompleta(personagemEfetivo),
    guilda: membroGuild?.Guild
      ? { id: membroGuild.Guild.id, nome: membroGuild.Guild.nome, sigla: membroGuild.Guild.sigla }
      : null,
  };
}

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
    if (!character) {
      return res.status(404).json({ message: "Você ainda não tem um personagem." });
    }

    res.status(200).json({
      status: "success",
      data: { character: await carregarRespostaDoPersonagem(character) },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem atual:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

// Catálogo fixo de avatares de perfil — todos reaproveitando arte que
// já existe no jogo (ilustrações de raça/classe), sem depender de URL
// arbitrária vinda do cliente (evita um jogador setar avatar_key pra
// uma URL de fora e o app renderizar imagem de terceiro sem controle
// nenhum). O frontend resolve cada chave pra um arquivo estático — ver
// AVATAR_CATALOGO em media-url.ts, que precisa ficar em sincronia com
// esta lista.
const AVATARES_VALIDOS = [
  "guerreiro",
  "mago",
  "humano",
  "humana",
  "elfo",
  "elfa",
  "anao",
  "ana",
  "orc",
  "orca",
  "celestial",
  "minotauro",
  "dragao",
  "guardiao_celeste",
];

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

    if (
      dadosPermitidos.avatar_key !== undefined &&
      dadosPermitidos.avatar_key !== null &&
      !AVATARES_VALIDOS.includes(dadosPermitidos.avatar_key)
    ) {
      return res.status(400).json({ message: "Avatar inválido." });
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
      attributes: ["id", "id_classe", "id_raca", "nivel", "dinheiro"],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    // Sincroniza antes de listar — mesmo motivo do carregarRespostaDoPersonagem:
    // garante que poderes já liberados pelo nível atual apareçam como
    // aprendidos, mesmo se essa for a primeira vez que o personagem é
    // carregado desde subir de nível.
    await concederPoderesIniciais(character);

    const [poderesClasse, poderesRaca, aprendidos, itemFragmento] = await Promise.all([
      ClassAbilities.findAll({
        where: { id_classe: character.id_classe },
        include: [{ model: Power }],
      }),
      RaceAbilities.findAll({
        where: { id_raca: character.id_raca },
        include: [{ model: Power }],
      }),
      CharacterAbilities.findAll({
        where: { id_personagem: character.id },
      }),
      Item.findOne({ where: { nome: NOME_ITEM_FRAGMENTO } }),
    ]);

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

    function montarEntrada(poder, nivelNecessario, origem, custoOuro) {
      const linhaAprendida = aprendidoPorPoder.get(poder.id);
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
        origem,
        nivel_necessario: nivelNecessario,
        aprendido: Boolean(linhaAprendida),
        ativo: linhaAprendida?.is_active ?? false,
        id_character_ability: linhaAprendida?.id ?? null,
        // custo_ouro = precisa comprar (não libera de graça por nível) —
        // pode_comprar só fica true quando falta comprar E o nível já foi
        // alcançado, pra aba de Habilidades saber quando mostrar o botão.
        custo_ouro: custoOuro ?? null,
        pode_comprar: !linhaAprendida && Boolean(custoOuro) && character.nivel >= nivelNecessario,
        // Nível 1-10 da habilidade em si (ver abilityLevelService.js) —
        // só faz sentido pra quem já aprendeu o poder.
        nivel_habilidade: linhaAprendida ? nivelHabilidade : null,
        nivel_maximo_habilidade: NIVEL_MAXIMO_HABILIDADE,
        marco_atual: linhaAprendida ? marcoDoNivel(nivelHabilidade) : null,
        proxima_evolucao: linhaAprendida ? custoParaEvoluir(nivelHabilidade) : null,
      };
    }

    const poderes = [
      ...poderesClasse.map((linha) =>
        montarEntrada(linha.Power, linha.nivel_aprendizagem, "classe", linha.custo_ouro),
      ),
      ...poderesRaca.map((linha) =>
        montarEntrada(linha.Power, linha.nivel_aprendizado, "raca", linha.custo_ouro),
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

      const [vinculoClasse, vinculoRaca] = await Promise.all([
        ClassAbilities.findOne({
          where: { id_classe: character.id_classe, id_poder: idPower },
          transaction,
        }),
        RaceAbilities.findOne({
          where: { id_raca: character.id_raca, id_power: idPower },
          transaction,
        }),
      ]);
      const vinculo = vinculoClasse ?? vinculoRaca;
      if (!vinculo) {
        throw Object.assign(
          new Error("Esse poder não pertence à classe/raça deste personagem."),
          { statusCode: 404 },
        );
      }

      const nivelNecessario = vinculoClasse ? vinculo.nivel_aprendizagem : vinculo.nivel_aprendizado;
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

      const characterAbility = await CharacterAbilities.create(
        {
          id_personagem: character.id,
          id_power: idPower,
          level_learned: nivelNecessario,
          is_active: true,
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
        await CharacterAbilities.findOrCreate({
          where: { id_personagem: character.id, id_power: evolucao.id_power_concedido },
          defaults: {
            id_personagem: character.id,
            id_power: evolucao.id_power_concedido,
            level_learned: character.nivel,
            is_active: true,
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

// GET a árvore de evolução de CLASSE — todos os caminhos configurados
// pra classe do personagem, cada um já com "pode_evoluir" calculado
// (nível + item o suficiente + ainda não escolheu nenhum caminho). Não
// confundir com getEvolucoesDisponiveis (aquele é o sistema de Evolution
// por natureza mágica, já existente, mantido à parte).
exports.getEvolucaoDeClasse = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      attributes: ["id", "nivel", "id_classe", "id_evolucao_classe", "dinheiro"],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const caminhos = await listarCaminhosDaClasse(character.id_classe);
    if (caminhos.length === 0) {
      return res.status(200).json({
        status: "success",
        data: { disponivel: false },
      });
    }

    const inventario = await CharacterInventory.findAll({ where: { id_personagem: character.id } });
    const quantidadePorItem = new Map(inventario.map((entrada) => [entrada.id_item, entrada.quantidade]));

    const caminhoEscolhido = character.id_evolucao_classe
      ? caminhos.find((c) => c.id === character.id_evolucao_classe)
      : null;

    const caminhosMontados = await Promise.all(
      caminhos.map(async (caminho) => {
        const item = await buscarItemRequisito(caminho.id_item_requisito);
        const quantidadeNoInventario = item ? (quantidadePorItem.get(item.id) ?? 0) : 0;
        const nivelOk = character.nivel >= caminho.nivel_necessario;
        const itemOk = quantidadeNoInventario >= caminho.quantidade_item_requisito;

        // Requisito de caça é opcional (nome_monstro_alvo pode ser NULL)
        // — caminho sem ele não trava por monstroOk (fica sempre true).
        const mortesAtuais = caminho.nome_monstro_alvo
          ? await contarMortesDoAlvo(character.id, caminho.nome_monstro_alvo)
          : 0;
        const monstroOk = !caminho.nome_monstro_alvo || mortesAtuais >= caminho.quantidade_monstro_necessaria;
        const ouroOk = character.dinheiro >= caminho.custo_ouro;

        return {
          id: caminho.id,
          nome: caminho.nome,
          descricao: caminho.descricao,
          nivel_necessario: caminho.nivel_necessario,
          nome_item_requisito: item?.nome ?? null,
          imagem_item_requisito: item?.imagem_url ?? null,
          quantidade_item_requisito: caminho.quantidade_item_requisito,
          quantidade_no_inventario: quantidadeNoInventario,
          nome_monstro_alvo: caminho.nome_monstro_alvo,
          quantidade_monstro_necessaria: caminho.quantidade_monstro_necessaria,
          quantidade_monstro_atual: mortesAtuais,
          custo_ouro: caminho.custo_ouro,
          bonus_forca: caminho.bonus_forca,
          bonus_vitalidade: caminho.bonus_vitalidade,
          bonus_agilidade: caminho.bonus_agilidade,
          bonus_inteligencia: caminho.bonus_inteligencia,
          bonus_velocidade: caminho.bonus_velocidade,
          imagem_url: caminho.imagem_url,
          escolhido: character.id_evolucao_classe === caminho.id,
          pode_evoluir: !character.id_evolucao_classe && nivelOk && itemOk && monstroOk && ouroOk,
          nivel_ok: nivelOk,
          item_ok: itemOk,
          monstro_ok: monstroOk,
          ouro_ok: ouroOk,
        };
      }),
    );

    res.status(200).json({
      status: "success",
      data: {
        disponivel: true,
        ja_evoluida: Boolean(character.id_evolucao_classe),
        caminho_escolhido: caminhoEscolhido?.nome ?? null,
        nivel_atual: character.nivel,
        dinheiro_atual: character.dinheiro,
        caminhos: caminhosMontados,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar evolução de classe:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar evolução de classe." });
  }
};

// POST escolhe UM caminho da árvore de classe (body: { id_caminho }) —
// consome a Relíquia de Ascensão específica desse caminho, exige nível
// mínimo, e é definitivo (sem "desevoluir" nem trocar de caminho depois).
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

      if (character.id_evolucao_classe) {
        throw Object.assign(new Error("Este personagem já evoluiu de classe."), {
          statusCode: 409,
        });
      }

      const caminho = await buscarCaminho(idCaminho);
      if (!caminho || caminho.id_classe !== character.id_classe) {
        throw Object.assign(
          new Error("Esse caminho de evolução não pertence à classe deste personagem."),
          { statusCode: 404 },
        );
      }
      if (character.nivel < caminho.nivel_necessario) {
        throw Object.assign(
          new Error(`Evoluir pra ${caminho.nome} exige nível ${caminho.nivel_necessario}.`),
          { statusCode: 400 },
        );
      }

      if (caminho.nome_monstro_alvo) {
        const mortes = await contarMortesDoAlvo(character.id, caminho.nome_monstro_alvo, transaction);
        if (mortes < caminho.quantidade_monstro_necessaria) {
          throw Object.assign(
            new Error(
              `Evoluir pra ${caminho.nome} exige ter derrotado ${caminho.quantidade_monstro_necessaria}x ${caminho.nome_monstro_alvo} (você já derrotou ${mortes}).`,
            ),
            { statusCode: 400 },
          );
        }
      }

      if (character.dinheiro < caminho.custo_ouro) {
        throw Object.assign(
          new Error(`Evoluir pra ${caminho.nome} custa ${caminho.custo_ouro} de ouro.`),
          { statusCode: 400 },
        );
      }

      const entradaInventario = await CharacterInventory.findOne({
        where: { id_personagem: character.id, id_item: caminho.id_item_requisito },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entradaInventario || entradaInventario.quantidade < caminho.quantidade_item_requisito) {
        const itemRequisito = await Item.findByPk(caminho.id_item_requisito, { transaction });
        throw Object.assign(
          new Error(
            `Você precisa de ${caminho.quantidade_item_requisito}x ${itemRequisito?.nome ?? "item"} pra evoluir pra ${caminho.nome}.`,
          ),
          { statusCode: 400 },
        );
      }

      character.dinheiro -= caminho.custo_ouro;
      entradaInventario.quantidade -= caminho.quantidade_item_requisito;
      if (entradaInventario.quantidade > 0) {
        await entradaInventario.save({ transaction });
      } else {
        await entradaInventario.destroy({ transaction });
      }

      character.id_evolucao_classe = caminho.id;
      character.forca += caminho.bonus_forca;
      character.vitalidade += caminho.bonus_vitalidade;
      character.agilidade += caminho.bonus_agilidade;
      character.inteligencia += caminho.bonus_inteligencia;
      character.velocidade += caminho.bonus_velocidade;
      await character.save({ transaction });

      return { character, nomeEvoluido: caminho.nome };
    });

    res.status(200).json({
      status: "success",
      message: `Seu personagem evoluiu para ${resultado.nomeEvoluido}!`,
      data: {
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
      // uma guilda ainda ativa deixava a regra da guilda inconsistente
      // (quem lidera uma guilda sem dono?) e, sem essa checagem, só
      // estourava como erro 500 genérico de violação de chave
      // estrangeira na hora do DELETE.
      const guildComoLiderOuFundador = await Guild.findOne({
        where: {
          status: "Ativa",
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
