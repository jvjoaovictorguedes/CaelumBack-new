"use strict";

// Catálogo inicial de Pesca & Navegação (Fase 10 reduzida — spec §33
// pede 15-20 espécies/3+zonas/4 embarcações/5 famílias de vara/5-7
// iscas; esta migration semeia só o suficiente pra provar a fatia
// vertical fim-a-fim, conforme escopo explicitamente reduzido pelo
// orquestrador desta implementação — ver relatório final). Idempotente
// por `key`/nome, mesmo padrão da migration de catálogo da Alquimia.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    async function criarItem({ nome, descricao, tipo_item, raridade, tier_equipamento = null, valor_venda = 0, negociavel_mercado = true }) {
      const [existente] = await sequelize.query(`SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`, { replacements: { nome } });
      if (existente.length > 0) return existente[0].id;
      const [inserido] = await sequelize.query(
        `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, tier_equipamento, disponivel_loja, ativo, negociavel_mercado, "createdAt", "updatedAt")
         VALUES (:nome, :descricao, :tipo_item, :raridade, 0, :valor_venda, 0.3, :tier_equipamento, false, true, :negociavel_mercado, now(), now())
         RETURNING id;`,
        { replacements: { nome, descricao, tipo_item, raridade, valor_venda, tier_equipamento, negociavel_mercado } },
      );
      return inserido[0].id;
    }

    async function criarEspecie({ key, id_item, comportamento_key, dificuldade_base, peso_min_g, peso_max_g, perfil_peso, pontos_base_torneio, lendario = false }) {
      const [existente] = await sequelize.query(`SELECT id FROM fishing_species WHERE key = :key LIMIT 1;`, { replacements: { key } });
      if (existente.length > 0) return existente[0].id;
      const [inserido] = await sequelize.query(
        `INSERT INTO fishing_species (key, id_item, comportamento_key, dificuldade_base, peso_min_g, peso_max_g, perfil_peso, pontos_base_torneio, lendario, ativo, "createdAt", "updatedAt")
         VALUES (:key, :id_item, :comportamento_key, :dificuldade_base, :peso_min_g, :peso_max_g, :perfil_peso, :pontos_base_torneio, :lendario, true, now(), now())
         RETURNING id;`,
        { replacements: { key, id_item, comportamento_key, dificuldade_base, peso_min_g, peso_max_g, perfil_peso, pontos_base_torneio, lendario } },
      );
      return inserido[0].id;
    }

    // --- Espécies (spec §34, subconjunto) ---------------------------------
    const idItemSardinha = await criarItem({ nome: "Sardinha Azul", descricao: "Peixe comum das águas costeiras — ótimo pra tutorial de Pesca.", tipo_item: "Material", raridade: "Comum", valor_venda: 4 });
    const idEspecieSardinha = await criarEspecie({ key: "sardinha_azul", id_item: idItemSardinha, comportamento_key: "CALM", dificuldade_base: 80, peso_min_g: 100, peso_max_g: 400, perfil_peso: "NORMAL", pontos_base_torneio: 50 });

    const idItemTruta = await criarItem({ nome: "Truta Rubra", descricao: "Dá arrancadas curtas e fortes — desafio pra iniciantes.", tipo_item: "Material", raridade: "Incomum", valor_venda: 12 });
    const idEspecieTruta = await criarEspecie({ key: "truta_rubra", id_item: idItemTruta, comportamento_key: "BURST", dificuldade_base: 220, peso_min_g: 300, peso_max_g: 1200, perfil_peso: "NORMAL", pontos_base_torneio: 120 });

    const idItemEnguia = await criarItem({ nome: "Enguia Sombria", descricao: "Ingrediente valioso de Alquimia — trocas rápidas de direção na disputa.", tipo_item: "Material", raridade: "Raro", valor_venda: 35 });
    const idEspecieEnguia = await criarEspecie({ key: "enguia_sombria", id_item: idItemEnguia, comportamento_key: "ERRATIC", dificuldade_base: 420, peso_min_g: 500, peso_max_g: 2000, perfil_peso: "LIGHT", pontos_base_torneio: 260 });

    const idItemAtum = await criarItem({ nome: "Atum Imperial", descricao: "Pesado e resistente — disputa longa de resistência.", tipo_item: "Material", raridade: "Epico", valor_venda: 90 });
    const idEspecieAtum = await criarEspecie({ key: "atum_imperial", id_item: idItemAtum, comportamento_key: "ENDURANCE", dificuldade_base: 620, peso_min_g: 2000, peso_max_g: 8000, perfil_peso: "HEAVY", pontos_base_torneio: 500 });

    // --- Zona + Porto (spec §8.2/§18.2) — ligados à Capital existente -----
    const [zonaExistente] = await sequelize.query(`SELECT id FROM fishing_zones WHERE key = 'costa_serena' LIMIT 1;`);
    let idZona = zonaExistente[0]?.id;
    if (!idZona) {
      const [inseridaZona] = await sequelize.query(
        `INSERT INTO fishing_zones (key, nome, descricao, id_world_node, nivel_pesca_minimo, tier_embarcacao_minimo, dificuldade_ambiente, ativo, "createdAt", "updatedAt")
         VALUES ('costa_serena', 'Costa Serena', 'Águas calmas perto da Capital — ideal pra quem está começando na Pesca.', 1, 1, 1, 100, true, now(), now())
         RETURNING id;`,
      );
      idZona = inseridaZona[0].id;
    }

    async function ligarEspecieNaZona(idSpecies, encounterWeight, nivelMin = 1) {
      const [existente] = await sequelize.query(
        `SELECT id FROM fishing_zone_species WHERE id_zone = :idZona AND id_species = :idSpecies LIMIT 1;`,
        { replacements: { idZona, idSpecies } },
      );
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO fishing_zone_species (id_zone, id_species, encounter_weight, nivel_pesca_minimo, ativo, "createdAt", "updatedAt")
         VALUES (:idZona, :idSpecies, :encounterWeight, :nivelMin, true, now(), now());`,
        { replacements: { idZona, idSpecies, encounterWeight, nivelMin } },
      );
    }
    await ligarEspecieNaZona(idEspecieSardinha, 500, 1);
    await ligarEspecieNaZona(idEspecieTruta, 250, 1);
    await ligarEspecieNaZona(idEspecieEnguia, 100, 3);
    await ligarEspecieNaZona(idEspecieAtum, 40, 8);

    const [portoExistente] = await sequelize.query(`SELECT id FROM fishing_ports WHERE key = 'porto_da_capital' LIMIT 1;`);
    let idPorto = portoExistente[0]?.id;
    if (!idPorto) {
      const [inseridoPorto] = await sequelize.query(
        `INSERT INTO fishing_ports (key, nome, id_world_node, descricao, ativo, "createdAt", "updatedAt")
         VALUES ('porto_da_capital', 'Porto da Capital', 1, 'Ponto de partida de toda jornada marítima de Caelum.', true, now(), now())
         RETURNING id;`,
      );
      idPorto = inseridoPorto[0].id;
    }

    // --- Embarcação + Rota (spec §18.3/§18.4) -----------------------------
    const [vesselExistente] = await sequelize.query(`SELECT id FROM vessels WHERE key = 'bote_de_madeira' LIMIT 1;`);
    let idVessel = vesselExistente[0]?.id;
    if (!idVessel) {
      const [inseridoVessel] = await sequelize.query(
        `INSERT INTO vessels (key, nome, tier, nivel_pesca_minimo, preco, descricao, ativo, "createdAt", "updatedAt")
         VALUES ('bote_de_madeira', 'Bote de Madeira', 1, 1, 0, 'Embarcação inicial gratuita — leva à costa.', true, now(), now())
         RETURNING id;`,
      );
      idVessel = inseridoVessel[0].id;
    }

    const [conexaoExistente] = await sequelize.query(
      `SELECT id FROM world_map_connections WHERE id_origem = 1 AND id_destino = 1 AND tipo = 'RotaMaritima' LIMIT 1;`,
    );
    let idConexao = conexaoExistente[0]?.id;
    if (!idConexao) {
      // Origem/destino apontam pra própria Capital (nó 1) — rota
      // marítima simbólica pra V1 (viagem instantânea, sem 2º nó dedicado
      // de "alto-mar" no mapa ainda — não é objetivo desta fase criar
      // conteúdo novo de mapa visual, spec §18.1).
      const [inseridaConexao] = await sequelize.query(
        `INSERT INTO world_map_connections (id_origem, id_destino, tipo, ordem, ativo, "createdAt", "updatedAt")
         VALUES (1, 1, 'RotaMaritima', 0, true, now(), now())
         RETURNING id;`,
      );
      idConexao = inseridaConexao[0].id;
    }

    const [rotaExistente] = await sequelize.query(`SELECT id FROM marine_routes WHERE id_world_connection = :idConexao LIMIT 1;`, { replacements: { idConexao } });
    if (rotaExistente.length === 0) {
      await sequelize.query(
        `INSERT INTO marine_routes (id_world_connection, id_port_origem, id_zone_destino, min_vessel_tier, distance, ativo, "createdAt", "updatedAt")
         VALUES (:idConexao, :idPorto, :idZona, 1, 1, true, now(), now());`,
        { replacements: { idConexao, idPorto, idZona } },
      );
    }

    // --- Iscas (spec §8.4) -------------------------------------------------
    const idItemMinhoca = await criarItem({ nome: "Minhoca Comum", descricao: "Isca básica — funciona bem com a maioria dos peixes costeiros.", tipo_item: "Material", raridade: "Comum", valor_venda: 1 });
    const [baitExistente1] = await sequelize.query(`SELECT id_item FROM fishing_baits WHERE key = 'minhoca_comum' LIMIT 1;`);
    if (baitExistente1.length === 0) {
      await sequelize.query(
        `INSERT INTO fishing_baits (id_item, key, nome_exibicao, nivel_pesca_minimo, ativo, "createdAt", "updatedAt")
         VALUES (:idItem, 'minhoca_comum', 'Minhoca Comum', 1, true, now(), now());`,
        { replacements: { idItem: idItemMinhoca } },
      );
    }

    const idItemBrilhante = await criarItem({ nome: "Isca Brilhante", descricao: "Atrai espécies mais elusivas — favorece peixes incomuns/raros.", tipo_item: "Material", raridade: "Incomum", valor_venda: 6 });
    const [baitExistente2] = await sequelize.query(`SELECT id_item FROM fishing_baits WHERE key = 'isca_brilhante' LIMIT 1;`);
    if (baitExistente2.length === 0) {
      await sequelize.query(
        `INSERT INTO fishing_baits (id_item, key, nome_exibicao, nivel_pesca_minimo, ativo, "createdAt", "updatedAt")
         VALUES (:idItem, 'isca_brilhante', 'Isca Brilhante', 1, true, now(), now());`,
        { replacements: { idItem: idItemBrilhante } },
      );
    }

    async function garantirAfinidade(idBaitItem, idSpecies, multiplicadorPpm) {
      const [existente] = await sequelize.query(
        `SELECT id FROM fishing_bait_affinities WHERE id_bait_item = :idBaitItem AND id_species = :idSpecies LIMIT 1;`,
        { replacements: { idBaitItem, idSpecies } },
      );
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO fishing_bait_affinities (id_bait_item, id_species, multiplicador_peso_ppm, "createdAt", "updatedAt")
         VALUES (:idBaitItem, :idSpecies, :multiplicadorPpm, now(), now());`,
        { replacements: { idBaitItem, idSpecies, multiplicadorPpm } },
      );
    }
    await garantirAfinidade(idItemBrilhante, idEspecieEnguia, 2_500_000);
    await garantirAfinidade(idItemBrilhante, idEspecieAtum, 1_500_000);
    await garantirAfinidade(idItemMinhoca, idEspecieSardinha, 1_300_000);

    // --- Varas (spec §9.3/§10.1/§10.3) — Item Ferramenta + FishingRodProperties
    // + Blueprint/Result na Forja, resultado só na qualidade Comum (escopo
    // reduzido de conteúdo — ver relatório final).
    async function garantirFishingRodProperties(idItem, props) {
      const [existente] = await sequelize.query(`SELECT id_item FROM fishing_rod_properties WHERE id_item = :idItem LIMIT 1;`, { replacements: { idItem } });
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO fishing_rod_properties (id_item, forca_linha, controle, recolhimento, precisao, estabilidade, nivel_pesca_minimo, "createdAt", "updatedAt")
         VALUES (:idItem, :forca_linha, :controle, :recolhimento, :precisao, :estabilidade, :nivel_pesca_minimo, now(), now());`,
        { replacements: { idItem, ...props } },
      );
    }

    async function garantirBlueprintDeVara({ nome, idItemVara, tier }) {
      const [existente] = await sequelize.query(`SELECT id FROM forge_blueprints WHERE nome = :nome LIMIT 1;`, { replacements: { nome } });
      let idBlueprint = existente[0]?.id;
      if (!idBlueprint) {
        const [inserido] = await sequelize.query(
          `INSERT INTO forge_blueprints (nome, categoria_equipamento, multiplicador_tempo, nivel_forja_minimo, ativo, tier_equipamento, "createdAt", "updatedAt")
           VALUES (:nome, 'Ferramenta', 1, 1, true, :tier, now(), now())
           RETURNING id;`,
          { replacements: { nome, tier } },
        );
        idBlueprint = inserido[0].id;
        await sequelize.query(
          `INSERT INTO forge_blueprint_ingredients (id_blueprint, tipo_insumo, id_recurso, quantidade_base)
           VALUES (:idBlueprint, 'Barra', 1, 2), (:idBlueprint, 'RecursoExpedicao', 9, 2);`,
          { replacements: { idBlueprint } },
        );
      }
      const [resultadoExistente] = await sequelize.query(
        `SELECT id_blueprint FROM forge_blueprint_results WHERE id_blueprint = :idBlueprint AND qualidade = 'Comum' LIMIT 1;`,
        { replacements: { idBlueprint } },
      );
      if (resultadoExistente.length === 0) {
        await sequelize.query(
          `INSERT INTO forge_blueprint_results (id_blueprint, qualidade, id_item) VALUES (:idBlueprint, 'Comum', :idItemVara);`,
          { replacements: { idBlueprint, idItemVara } },
        );
      }
    }

    const idItemVaraBambu = await criarItem({
      nome: "Vara de Bambu", descricao: "Baixa força, boa precisão — a vara inicial de todo pescador.",
      tipo_item: "Ferramenta", raridade: "Comum", tier_equipamento: 5, valor_venda: 15,
    });
    await garantirFishingRodProperties(idItemVaraBambu, { forca_linha: 80, controle: 100, recolhimento: 90, precisao: 160, estabilidade: 90, nivel_pesca_minimo: 1 });
    await garantirBlueprintDeVara({ nome: "Vara de Bambu", idItemVara: idItemVaraBambu, tier: 5 });

    const idItemVaraReforcada = await criarItem({
      nome: "Vara Reforçada", descricao: "Mais força e estabilidade — pra disputas mais duras em mar aberto.",
      tipo_item: "Ferramenta", raridade: "Incomum", tier_equipamento: 4, valor_venda: 40,
    });
    await garantirFishingRodProperties(idItemVaraReforcada, { forca_linha: 160, controle: 120, recolhimento: 110, precisao: 100, estabilidade: 150, nivel_pesca_minimo: 5 });
    await garantirBlueprintDeVara({ nome: "Vara Reforçada", idItemVara: idItemVaraReforcada, tier: 4 });

    // --- Patch note (spec §40) ---------------------------------------------
    const [notaExistente] = await sequelize.query(`SELECT id FROM patch_notes WHERE feature = 'Pesca & Navegação' AND versao = '1.0' LIMIT 1;`);
    if (notaExistente.length === 0) {
      const [[{ max }]] = await sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`);
      await sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, 'Pesca & Navegação', '1.0', 'Novo: Pesca & Navegação',
           'Chegou uma nova atividade fora do combate: Pesca! Navegue até a Costa Serena, escolha uma vara e uma isca e dispute um minigame de tensão/recolhimento pra capturar peixes. Peixes viram itens que podem ser vendidos, usados no Caldeirão ou colecionados no seu Nível de Pesca (1-25). Varas são fabricadas e refinadas na Forja como Ferramentas — nunca contam como arma nem afetam seu Poder de Combate.',
           CURRENT_DATE, now(), now());`,
        { replacements: { ordem: max + 1 } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Pesca & Navegação", versao: "1.0" });
    // Demais linhas de catálogo não são revertidas — mesma decisão da
    // migration de catálogo da Alquimia (conteúdo de jogo, não schema).
  },
};
