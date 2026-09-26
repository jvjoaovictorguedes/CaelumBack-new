"use strict";

// Sistema de Proezas Únicas §25/§28 — Fase 7 (Conteúdo). Seed inicial
// deliberadamente pequeno (9, dentro da faixa 8-12 recomendada):
// Aventura(1) + Bestiário(1) + Forja(2) + Alquimia(1) + Pesca(1) +
// Navegação(1) + Ameaça Mundial(1) + Expedição(1). Cada condição
// referencia dado REAL já existente no jogo (zonas/monstros/espécies/
// rota/expedição — consultados diretamente no banco antes de escrever
// esta migration, nunca inventados) — NUNCA um id de Blueprint/
// WorldBossConfig específico, porque essas duas tabelas estão vazias
// hoje (Forja teve todos os blueprints excluídos numa correção
// anterior; nenhuma Ameaça Mundial foi cadastrada ainda) — as duas
// Proezas desses domínios usam só os campos que não dependem de uma
// linha administrativa específica (resultado/sucesso/finalBlow),
// continuando válidas não importa o que um admin cadastre depois.
//
// Cada Legado usa os campos PADRÃO de Power (dano_base/cura_base/
// custo_mana/cooldown/escala_atributo) — o motor de combate já
// interpreta esses campos pra QUALQUER Power, então o Legado funciona
// de verdade em combate desde já. `effect_key` em UniquePowerEffect
// aponta pra um handler ainda NÃO implementado em
// uniquePowerEffectRegistry.js (EFFECT_HANDLERS continua vazio de
// propósito — Fase 3 já documentava "infraestrutura primeiro,
// conteúdo depois": o handler concreto de cada mecânica única
// descrita na spec (ex.: "1x por combate, golpe fatal vira 1 HP") é
// trabalho de motor de combate, fora do escopo de uma migration de
// seed de conteúdo — ver relatório final). Sem UniquePowerEffect
// nenhum Legado sequer funcionaria em PvE (uniquePowerEffectRegistry.
// idsDesautorizadosNoContexto bloqueia por padrão quando não há linha
// configurada), então TODA Proeza abaixo já vem com o efeito criado,
// travado fora de PvP Casual/Ranked/Torneio (defaults do model —
// nunca setados aqui como true, mesmo sem precisar).
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    async function criarPower({ nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, cooldown, escala_atributo, valor_escala }) {
      const [existente] = await sequelize.query(`SELECT id FROM "Powers" WHERE nome = :nome LIMIT 1;`, { replacements: { nome } });
      if (existente.length > 0) return existente[0].id;
      const [inserido] = await sequelize.query(
        `INSERT INTO "Powers" (nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, cooldown, escala_atributo, valor_escala, acquisition_scope, "createdAt", "updatedAt")
         VALUES (:nome, :descricao, :tipo_poder, :custo_mana, :dano_base, :cura_base, :cooldown, :escala_atributo, :valor_escala, 'UNIQUE_FEAT', now(), now())
         RETURNING id;`,
        { replacements: { nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, cooldown, escala_atributo, valor_escala } },
      );
      return inserido[0].id;
    }

    async function criarUniquePowerEffect(idPower, effectKey) {
      const [existente] = await sequelize.query(`SELECT id_power FROM unique_power_effects WHERE id_power = :idPower LIMIT 1;`, { replacements: { idPower } });
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO unique_power_effects (id_power, effect_key, config, allow_pve, allow_party, allow_guild_boss, allow_world_boss, allow_pvp_casual, allow_ranked, allow_tournament, ativo, "createdAt", "updatedAt")
         VALUES (:idPower, :effectKey, '{}'::jsonb, true, true, true, true, false, false, false, true, now(), now());`,
        { replacements: { idPower, effectKey } },
      );
    }

    async function criarUniqueFeat({
      key,
      nome,
      descricao_publica,
      descricao_secreta_admin,
      icone_url = null,
      categoria,
      trigger_key,
      trigger_config,
      visibility_before_claim,
      reveal_after_claim,
      id_power_reward,
    }) {
      const [existente] = await sequelize.query(`SELECT id FROM unique_feats WHERE key = :key LIMIT 1;`, { replacements: { key } });
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO unique_feats (key, nome, descricao_publica, descricao_secreta_admin, icone_url, categoria, trigger_key, trigger_config, id_power_reward, visibility_before_claim, reveal_after_claim, announce_global, ativa, "createdAt", "updatedAt")
         VALUES (:key, :nome, :descricao_publica, :descricao_secreta_admin, :icone_url, :categoria, :trigger_key, :trigger_config::jsonb, :id_power_reward, :visibility_before_claim, :reveal_after_claim, true, true, now(), now());`,
        {
          replacements: {
            key,
            nome,
            descricao_publica,
            descricao_secreta_admin,
            icone_url,
            categoria,
            trigger_key,
            trigger_config: JSON.stringify(trigger_config),
            id_power_reward,
            visibility_before_claim,
            reveal_after_claim,
          },
        },
      );
    }

    async function semear(definicao) {
      const idPower = await criarPower(definicao.power);
      await criarUniquePowerEffect(idPower, definicao.effectKey);
      await criarUniqueFeat({ ...definicao.feat, id_power_reward: idPower });
    }

    // 1) AVENTURA — "Covil do Minotauro" (id 3, zona real de nível 46-50,
    // a mais dura do jogo) — vencer um combate sobrevivendo por muito
    // pouco (hpRestante<=1).
    await semear({
      power: {
        nome: "Recusar o Destino",
        descricao: "Uma vez por combate, um golpe que seria fatal deixa você com 1 ponto de vida.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        dano_base: 0,
        cura_base: 0,
        cooldown: null,
        escala_atributo: "Vitalidade",
        valor_escala: 8,
      },
      effectKey: "recusar_o_destino",
      feat: {
        key: "sobrevivente_impossivel",
        nome: "O Sobrevivente Impossível",
        descricao_publica: "Uma lenda fala de alguém que encarou a morte no Covil do Minotauro e simplesmente recusou.",
        descricao_secreta_admin: "ADVENTURE_VICTORY: vencer um combate na zona 'Covil do Minotauro' (id 3) com hpRestante <= 1.",
        categoria: "Aventura",
        trigger_key: "ADVENTURE_VICTORY",
        trigger_config: { zoneId: 3, hpRestante: { max: 1 } },
        visibility_before_claim: "TEASER",
        reveal_after_claim: "FULL",
      },
    });

    // 2) BESTIÁRIO — "Abismo Dracônico" (id 10, zona real de nível 41-45)
    // — completar a maestria máxima da região (dominar o bestiário
    // inteiro daquela zona).
    await semear({
      power: {
        nome: "Olhar do Abismo",
        descricao: "Um golpe de poder crescente, moldado por quem já olhou fundo demais no Abismo.",
        tipo_poder: "Ativo",
        custo_mana: 28,
        dano_base: 32,
        cura_base: 0,
        cooldown: 4,
        escala_atributo: "Inteligencia",
        valor_escala: 1.5,
      },
      effectKey: "olhar_do_abismo",
      feat: {
        key: "aquele_que_viu_o_abismo",
        nome: "Aquele que Viu o Abismo",
        descricao_publica: "Dizem que o Abismo Dracônico devolve algo a quem o compreende por completo — mas cobra caro por isso.",
        descricao_secreta_admin: "BESTIARY_EVENT: atingir maestriaNivel >= 5 (máxima) na região 'Abismo Dracônico' (id_area 10).",
        categoria: "Bestiário",
        trigger_key: "BESTIARY_EVENT",
        trigger_config: { regiaoId: 10, maestriaNivel: { min: 5 } },
        visibility_before_claim: "HIDDEN",
        reveal_after_claim: "FULL",
      },
    });

    // 3) FORJA (fabricação) — qualidade Mítica em qualquer blueprint
    // (nunca um blueprint específico — Forja não tem nenhum cadastrado
    // hoje; a condição continua válida com qualquer blueprint futuro).
    await semear({
      power: {
        nome: "Marca do Criador",
        descricao: "Uma marca invisível gravada em tudo que você forja — o metal reconhece o mestre.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        dano_base: 0,
        cura_base: 0,
        cooldown: null,
        escala_atributo: "Forca",
        valor_escala: 7,
      },
      effectKey: "marca_do_criador",
      feat: {
        key: "ferreiro_impossivel",
        nome: "O Ferreiro Impossível",
        descricao_publica: "Uma lenda de forja fala de uma peça tão perfeita que a própria Forja parou pra reconhecer.",
        descricao_secreta_admin: "FORGE_CRAFT_COMPLETED: coletar uma fabricação com resultado (qualidade_final) = 'Mitico', em qualquer blueprint.",
        categoria: "Forja",
        trigger_key: "FORGE_CRAFT_COMPLETED",
        trigger_config: { resultado: "Mitico" },
        visibility_before_claim: "TEASER",
        reveal_after_claim: "FULL",
      },
    });

    // 4) FORJA (refino) — refinar com sucesso além do nível 8.
    await semear({
      power: {
        nome: "Têmpera Absoluta",
        descricao: "Cada refino seu carrega uma têmpera que ninguém mais consegue replicar.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        dano_base: 0,
        cura_base: 0,
        cooldown: null,
        escala_atributo: "Agilidade",
        valor_escala: 7,
      },
      effectKey: "tempera_absoluta",
      feat: {
        key: "refinador_alem_do_limite",
        nome: "O Refinador Além do Limite",
        descricao_publica: "Um refino tão além do comum que os próprios Ferreiros da Forja duvidaram ao ver.",
        descricao_secreta_admin: "FORGE_REFINEMENT_COMPLETED: coletar um refino com sucesso=true e targetLevel >= 8.",
        categoria: "Forja",
        trigger_key: "FORGE_REFINEMENT_COMPLETED",
        trigger_config: { sucesso: true, targetLevel: { min: 8 } },
        visibility_before_claim: "HIDDEN",
        reveal_after_claim: "FULL",
      },
    });

    // 5) ALQUIMIA — preparar um lote do Antídoto (recipeId 3, receita
    // real já cadastrada) — a raridade vem de ser o primeiro do
    // servidor, não da receita em si (§1 da spec).
    await semear({
      power: {
        nome: "Transmutação Proibida",
        descricao: "Um efeito incomum, fruto de uma combinação que a Coroa preferia esquecer.",
        tipo_poder: "Ativo",
        custo_mana: 25,
        dano_base: 0,
        cura_base: 20,
        cooldown: 5,
        escala_atributo: "Inteligencia",
        valor_escala: 1.2,
      },
      effectKey: "transmutacao_proibida",
      feat: {
        key: "alquimista_proibido",
        nome: "O Alquimista Proibido",
        descricao_publica: "Uma variante proibida de um antídoto comum — descoberta, dizem, por acidente.",
        descricao_secreta_admin: "ALCHEMY_CRAFT_COMPLETED: preparar um lote da receita 'ANTIDOTO_BASICO' (recipeId 3).",
        categoria: "Alquimia",
        trigger_key: "ALCHEMY_CRAFT_COMPLETED",
        trigger_config: { recipeId: 3 },
        visibility_before_claim: "TEASER",
        reveal_after_claim: "FLAVOR_ONLY",
      },
    });

    // 6) PESCA — capturar o Atum Imperial (speciesId 4, espécie real
    // mais difícil do catálogo) num peso excepcional.
    await semear({
      power: {
        nome: "Mestre das Profundezas",
        descricao: "As águas mais fundas reconhecem quem já pescou o impossível.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        dano_base: 0,
        cura_base: 0,
        cooldown: null,
        escala_atributo: "Vitalidade",
        valor_escala: 6,
      },
      effectKey: "mestre_das_profundezas",
      feat: {
        key: "pescaria_lendaria",
        nome: "A Pescaria Lendária",
        descricao_publica: "Uma captura tão grande que os portos ainda contam a história — e duvidam da balança.",
        descricao_secreta_admin: "FISH_CAUGHT: capturar um Atum Imperial (speciesId 4) com peso >= 7500g (perto do teto de 8000g da espécie).",
        categoria: "Pesca",
        trigger_key: "FISH_CAUGHT",
        trigger_config: { speciesId: 4, peso: { min: 7500 } },
        visibility_before_claim: "TEASER",
        reveal_after_claim: "FULL",
      },
    });

    // 7) NAVEGAÇÃO — descobrir a rota real "Porto da Capital -> Costa
    // Serena" (id 1, única rota real cadastrada hoje).
    await semear({
      power: {
        nome: "Chamado das Marés",
        descricao: "As marés parecem responder a quem já seguiu esse chamado uma vez.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        dano_base: 0,
        cura_base: 0,
        cooldown: null,
        escala_atributo: "Velocidade",
        valor_escala: 6,
      },
      effectKey: "chamado_das_mares",
      feat: {
        key: "navegador_perdido",
        nome: "O Navegador Perdido",
        descricao_publica: "Uma rota marítima comum, dizem, esconde uma passagem que só um navegador perdido soube achar.",
        descricao_secreta_admin: "NAVIGATION_DISCOVERY: completar a rota 'Porto da Capital -> Costa Serena' (rotaId 1).",
        categoria: "Navegação",
        trigger_key: "NAVIGATION_DISCOVERY",
        trigger_config: { rotaId: 1 },
        visibility_before_claim: "HIDDEN",
        reveal_after_claim: "FULL",
      },
    });

    // 8) AMEAÇA MUNDIAL — golpe final em QUALQUER Ameaça Mundial
    // (nenhum bossConfigId específico — nenhuma Ameaça foi cadastrada
    // ainda; a condição continua válida pra qualquer uma futura).
    await semear({
      power: {
        nome: "Eco do Colosso",
        descricao: "Um ataque de alto impacto, identidade exclusiva de quem já encerrou uma Era.",
        tipo_poder: "Ativo",
        custo_mana: 35,
        dano_base: 40,
        cura_base: 0,
        cooldown: 6,
        escala_atributo: "Forca",
        valor_escala: 1.6,
      },
      effectKey: "eco_do_colosso",
      feat: {
        key: "primeiro_golpe_de_uma_era",
        nome: "Primeiro Golpe de uma Era",
        descricao_publica: "A primeira Ameaça Mundial de Caelum caiu sob um único golpe final — e uma Era terminou com ela.",
        descricao_secreta_admin: "WORLD_BOSS_FINAL_BLOW: desferir o golpe final (finalBlow=true) em qualquer Ameaça Mundial.",
        categoria: "Ameaça Mundial",
        trigger_key: "WORLD_BOSS_FINAL_BLOW",
        trigger_config: { finalBlow: true },
        visibility_before_claim: "TEASER",
        reveal_after_claim: "FULL",
      },
    });

    // 9) EXPEDIÇÃO — completar uma coleta de qualidade Mítica na
    // região "Jardim Celestial" (id 15, região real de maior nível).
    await semear({
      power: {
        nome: "Instinto do Explorador",
        descricao: "Um instinto que só se desenvolve depois de desbravar territórios que ninguém mais alcançou.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        dano_base: 0,
        cura_base: 0,
        cooldown: null,
        escala_atributo: "Inteligencia",
        valor_escala: 6,
      },
      effectKey: "instinto_do_explorador",
      feat: {
        key: "desbravador_celestial",
        nome: "O Desbravador Celestial",
        descricao_publica: "No Jardim Celestial, uma coleta impossível abriu caminho pra algo que nenhum explorador tinha visto antes.",
        descricao_secreta_admin: "EXPEDITION_COMPLETED: coletar na região 'Jardim Celestial' (id 15) com qualidade = 'Mitico'.",
        categoria: "Expedição",
        trigger_key: "EXPEDITION_COMPLETED",
        trigger_config: { regiaoId: 15, qualidade: "Mitico" },
        visibility_before_claim: "TEASER",
        reveal_after_claim: "FULL",
      },
    });
  },

  // Reversão remove só o conteúdo desta migration (por key/nome) — se
  // alguma dessas 9 já tiver sido conquistada, a claim (histórico real
  // do servidor) NUNCA é apagada por uma migration de conteúdo (§21:
  // nunca reset operacional comum); o down() para de propósito nesse
  // caso, deixando pra um reparo administrativo explícito decidir.
  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const keys = [
      "sobrevivente_impossivel",
      "aquele_que_viu_o_abismo",
      "ferreiro_impossivel",
      "refinador_alem_do_limite",
      "alquimista_proibido",
      "pescaria_lendaria",
      "navegador_perdido",
      "primeiro_golpe_de_uma_era",
      "desbravador_celestial",
    ];

    const [feats] = await sequelize.query(
      `SELECT id, id_power_reward FROM unique_feats WHERE key IN (:keys);`,
      { replacements: { keys } },
    );

    for (const feat of feats) {
      // eslint-disable-next-line no-await-in-loop -- down() de migration roda uma vez, sequencial é suficiente
      const [claims] = await sequelize.query(`SELECT id FROM unique_feat_claims WHERE id_unique_feat = :id LIMIT 1;`, { replacements: { id: feat.id } });
      if (claims.length > 0) {
        // eslint-disable-next-line no-continue -- já conquistada: nunca reverte, preserva o histórico real do servidor
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(`DELETE FROM unique_power_effects WHERE id_power = :idPower;`, { replacements: { idPower: feat.id_power_reward } });
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(`DELETE FROM unique_feats WHERE id = :id;`, { replacements: { id: feat.id } });
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(`DELETE FROM "Powers" WHERE id = :idPower;`, { replacements: { idPower: feat.id_power_reward } });
    }
  },
};
