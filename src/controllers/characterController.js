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
const CharacterEquipment = require("../models/CharacterEquipment");
const ClassAbilities = require("../models/ClassAbilities");
const RaceAbilities = require("../models/RaceAbilities");
const CharacterAbilities = require("../models/CharacterAbilities");
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
      },
    }),
    RaceAbilities.findAll({
      where: {
        id_raca: character.id_raca,
        nivel_aprendizado: { [Op.lte]: character.nivel },
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

// Único uso legítimo hoje é a troca de sexo (GenderToggleButton). Sem
// uma lista explícita, esse PATCH aceitava qualquer coluna do modelo —
// dinheiro, nivel, stats, id_usuario — vindo direto do corpo da
// requisição.
const CAMPOS_EDITAVEIS = ["genero"];

exports.updateCharacter = async (req, res) => {
  try {
    const dadosPermitidos = {};
    for (const campo of CAMPOS_EDITAVEIS) {
      if (req.body[campo] !== undefined) dadosPermitidos[campo] = req.body[campo];
    }
    if (Object.keys(dadosPermitidos).length === 0) {
      return res.status(400).json({ message: "Nenhum campo editável foi enviado." });
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

// Lista TODOS os poderes de classe/raça do personagem (mesmo os que o
// nível ainda não libera) — a aba de Habilidades do front precisa
// mostrar os bloqueados também (só visualização, "requer nível X"), não
// só os já aprendidos. Poderes já aprendidos vêm com o estado
// aprendido/ativo de CharacterAbilities; os ainda não aprendidos vêm só
// com os dados do Power + nível necessário.
exports.getPoderesDisponiveis = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      attributes: ["id", "id_classe", "id_raca", "nivel"],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    // Sincroniza antes de listar — mesmo motivo do carregarRespostaDoPersonagem:
    // garante que poderes já liberados pelo nível atual apareçam como
    // aprendidos, mesmo se essa for a primeira vez que o personagem é
    // carregado desde subir de nível.
    await concederPoderesIniciais(character);

    const [poderesClasse, poderesRaca, aprendidos] = await Promise.all([
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
    ]);

    const aprendidoPorPoder = new Map(
      aprendidos.map((linha) => [linha.id_power, linha]),
    );

    function montarEntrada(poder, nivelNecessario, origem) {
      const linhaAprendida = aprendidoPorPoder.get(poder.id);
      return {
        id_power: poder.id,
        nome: poder.nome,
        descricao: poder.descricao,
        tipo_poder: poder.tipo_poder,
        custo_mana: poder.custo_mana,
        dano_base: poder.dano_base,
        cura_base: poder.cura_base,
        cooldown: poder.cooldown,
        escala_atributo: poder.escala_atributo,
        valor_escala: poder.valor_escala,
        imagem_url: poder.imagem_url,
        origem,
        nivel_necessario: nivelNecessario,
        aprendido: Boolean(linhaAprendida),
        ativo: linhaAprendida?.is_active ?? false,
        id_character_ability: linhaAprendida?.id ?? null,
      };
    }

    const poderes = [
      ...poderesClasse.map((linha) =>
        montarEntrada(linha.Power, linha.nivel_aprendizagem, "classe"),
      ),
      ...poderesRaca.map((linha) =>
        montarEntrada(linha.Power, linha.nivel_aprendizado, "raca"),
      ),
    ];

    res.status(200).json({
      status: "success",
      data: { poderes },
    });
  } catch (error) {
    console.error("Erro ao buscar poderes disponíveis:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar poderes." });
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
