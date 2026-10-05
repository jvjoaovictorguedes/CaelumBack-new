#!/usr/bin/env bash
# Replica o CATÁLOGO de produção (conteúdo configurado pelo admin: Itens,
# Powers, Monstros, Zonas, Receitas, Missões, catálogos de Pesca/Forja/
# Alquimia, World Boss/Guild Boss CONFIG, Wiki, etc.) pro banco de teste.
#
# NÃO inclui (de propósito):
#   - Nenhuma tabela de jogador/conta real: users, Characters e TUDO que
#     depende deles por transitividade (inventário, equipamento, guildas
#     reais, mercado, PvP, chat, progresso de missão, etc. -- mapeado via
#     FK + varredura de colunas id_personagem/id_usuario/id_guild contra
#     o schema real; lista completa de tabelas excluídas em
#     scratchpad/fk_result.txt desta sessão se quiser conferir).
#   - media_assets / music_track_file_versions (as 2 tabelas que guardam
#     os BYTES de imagem/áudio em BLOB -- pedido original).
#   - A tabela SequelizeMeta (controle de migration, nunca é "dado de jogo";
#     o banco de teste já tem a própria, não sobrescreve).
#
# O teste já tem seus próprios users/Characters/etc. -- este script NUNCA
# toca nessas tabelas (nem lê nem escreve), só nas 93 de catálogo abaixo.
#
# Uso:
#   PROD_DATABASE_URL="postgresql://..." TEST_DATABASE_URL="postgresql://..." ./replicar_catalogo_prod_para_teste.sh
# (ou exporte as duas env vars antes de rodar; TEST_DATABASE_URL já
# existe no seu .env local se for o mesmo banco de teste de sempre)

set -euo pipefail

: "${PROD_DATABASE_URL:?Defina PROD_DATABASE_URL (a connection string de produção -- idealmente a pública do Railway, read-only se você tiver uma).}"
: "${TEST_DATABASE_URL:?Defina TEST_DATABASE_URL (a connection string do banco de teste que vai receber os dados).}"

DUMP_FILE="${DUMP_FILE:-/tmp/catalogo_prod_$(date +%Y%m%d_%H%M%S).sql}"

echo "==> 1/3 Extraindo catálogo de produção (93 tabelas, sem mídia, sem dado de jogador) para $DUMP_FILE"
pg_dump "$PROD_DATABASE_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  -t "public.AdventureMonsterLoots" \
  -t "public.AdventureMonsters" \
  -t "public.AdventureZoneLoots" \
  -t "public.AdventureZoneMonsters" \
  -t "public.AdventureZones" \
  -t "public.ArmorProperties" \
  -t "public.Classes" \
  -t "public.GuildLevelConfig" \
  -t "public.Items" \
  -t "public.Powers" \
  -t "public.RaceAbilities" \
  -t "public.Races" \
  -t "public.WeaponProperties" \
  -t "public.achievements" \
  -t "public.admin_permissions" \
  -t "public.admin_role_permissions" \
  -t "public.admin_roles" \
  -t "public.adventure_guild_mission_rewards" \
  -t "public.adventure_guild_missions" \
  -t "public.adventure_guild_offers" \
  -t "public.alchemy_recipe_ingredients" \
  -t "public.alchemy_recipes" \
  -t "public.class_abilities" \
  -t "public.class_evolution_abilities" \
  -t "public.class_evolution_effects" \
  -t "public.class_evolution_paths" \
  -t "public.class_evolution_requirements" \
  -t "public.consumable_effects" \
  -t "public.consumable_properties" \
  -t "public.crafting_recipe_ingredients" \
  -t "public.crafting_recipes" \
  -t "public.equipment_set_bonuses" \
  -t "public.equipment_set_pieces" \
  -t "public.equipment_sets" \
  -t "public.evolutions" \
  -t "public.expedition_region_resources" \
  -t "public.expedition_regions" \
  -t "public.expedition_resource_items" \
  -t "public.expedition_resources" \
  -t "public.fishing_bait_affinities" \
  -t "public.fishing_baits" \
  -t "public.fishing_ports" \
  -t "public.fishing_rod_properties" \
  -t "public.fishing_species" \
  -t "public.fishing_zone_species" \
  -t "public.fishing_zones" \
  -t "public.forge_bar_items" \
  -t "public.forge_blueprint_ingredients" \
  -t "public.forge_blueprint_results" \
  -t "public.forge_blueprints" \
  -t "public.forge_recipes" \
  -t "public.forge_scroll_ingredients" \
  -t "public.forge_scrolls" \
  -t "public.forge_tool_effects" \
  -t "public.forge_tool_properties" \
  -t "public.global_buffs" \
  -t "public.guild_boss_abilities" \
  -t "public.guild_boss_configs" \
  -t "public.guild_missions" \
  -t "public.item_rarity_attribute_overrides" \
  -t "public.marine_routes" \
  -t "public.missions" \
  -t "public.monster_abilities" \
  -t "public.monster_ability_conditions" \
  -t "public.monster_status_effects" \
  -t "public.music_assignments" \
  -t "public.music_config_versions" \
  -t "public.music_pool_track_assignments" \
  -t "public.music_pools" \
  -t "public.music_tracks" \
  -t "public.nature_abilities" \
  -t "public.power_books" \
  -t "public.power_combat_effects" \
  -t "public.power_status_effects" \
  -t "public.pvp_seasons" \
  -t "public.tavern_games" \
  -t "public.tavern_menu_items" \
  -t "public.titles" \
  -t "public.unique_feats" \
  -t "public.unique_power_effects" \
  -t "public.vessels" \
  -t "public.weapon_status_effects" \
  -t "public.wiki_articles" \
  -t "public.world_boss_abilities" \
  -t "public.world_boss_activity_metrics" \
  -t "public.world_boss_config_zones" \
  -t "public.world_boss_configs" \
  -t "public.world_boss_phases" \
  -t "public.world_boss_ranking_rewards" \
  -t "public.world_boss_status_resistances" \
  -t "public.world_map_connections" \
  -t "public.world_map_nodes" \
  -t "public.world_territories" \
  -f "$DUMP_FILE"

echo "==> 2/3 Limpando as tabelas de catálogo no banco de teste e carregando os dados de produção (tudo numa transação só)"
{
  echo "BEGIN;"
  cat <<'PRESQL'
ALTER TABLE "public"."AdventureMonsterLoots" DISABLE TRIGGER ALL;
DELETE FROM "public"."AdventureMonsterLoots";
ALTER TABLE "public"."AdventureMonsters" DISABLE TRIGGER ALL;
DELETE FROM "public"."AdventureMonsters";
ALTER TABLE "public"."AdventureZoneLoots" DISABLE TRIGGER ALL;
DELETE FROM "public"."AdventureZoneLoots";
ALTER TABLE "public"."AdventureZoneMonsters" DISABLE TRIGGER ALL;
DELETE FROM "public"."AdventureZoneMonsters";
ALTER TABLE "public"."AdventureZones" DISABLE TRIGGER ALL;
DELETE FROM "public"."AdventureZones";
ALTER TABLE "public"."ArmorProperties" DISABLE TRIGGER ALL;
DELETE FROM "public"."ArmorProperties";
ALTER TABLE "public"."Classes" DISABLE TRIGGER ALL;
DELETE FROM "public"."Classes";
ALTER TABLE "public"."GuildLevelConfig" DISABLE TRIGGER ALL;
DELETE FROM "public"."GuildLevelConfig";
ALTER TABLE "public"."Items" DISABLE TRIGGER ALL;
DELETE FROM "public"."Items";
ALTER TABLE "public"."Powers" DISABLE TRIGGER ALL;
DELETE FROM "public"."Powers";
ALTER TABLE "public"."RaceAbilities" DISABLE TRIGGER ALL;
DELETE FROM "public"."RaceAbilities";
ALTER TABLE "public"."Races" DISABLE TRIGGER ALL;
DELETE FROM "public"."Races";
ALTER TABLE "public"."WeaponProperties" DISABLE TRIGGER ALL;
DELETE FROM "public"."WeaponProperties";
ALTER TABLE "public"."achievements" DISABLE TRIGGER ALL;
DELETE FROM "public"."achievements";
ALTER TABLE "public"."admin_permissions" DISABLE TRIGGER ALL;
DELETE FROM "public"."admin_permissions";
ALTER TABLE "public"."admin_role_permissions" DISABLE TRIGGER ALL;
DELETE FROM "public"."admin_role_permissions";
ALTER TABLE "public"."admin_roles" DISABLE TRIGGER ALL;
DELETE FROM "public"."admin_roles";
ALTER TABLE "public"."adventure_guild_mission_rewards" DISABLE TRIGGER ALL;
DELETE FROM "public"."adventure_guild_mission_rewards";
ALTER TABLE "public"."adventure_guild_missions" DISABLE TRIGGER ALL;
DELETE FROM "public"."adventure_guild_missions";
ALTER TABLE "public"."adventure_guild_offers" DISABLE TRIGGER ALL;
DELETE FROM "public"."adventure_guild_offers";
ALTER TABLE "public"."alchemy_recipe_ingredients" DISABLE TRIGGER ALL;
DELETE FROM "public"."alchemy_recipe_ingredients";
ALTER TABLE "public"."alchemy_recipes" DISABLE TRIGGER ALL;
DELETE FROM "public"."alchemy_recipes";
ALTER TABLE "public"."class_abilities" DISABLE TRIGGER ALL;
DELETE FROM "public"."class_abilities";
ALTER TABLE "public"."class_evolution_abilities" DISABLE TRIGGER ALL;
DELETE FROM "public"."class_evolution_abilities";
ALTER TABLE "public"."class_evolution_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."class_evolution_effects";
ALTER TABLE "public"."class_evolution_paths" DISABLE TRIGGER ALL;
DELETE FROM "public"."class_evolution_paths";
ALTER TABLE "public"."class_evolution_requirements" DISABLE TRIGGER ALL;
DELETE FROM "public"."class_evolution_requirements";
ALTER TABLE "public"."consumable_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."consumable_effects";
ALTER TABLE "public"."consumable_properties" DISABLE TRIGGER ALL;
DELETE FROM "public"."consumable_properties";
ALTER TABLE "public"."crafting_recipe_ingredients" DISABLE TRIGGER ALL;
DELETE FROM "public"."crafting_recipe_ingredients";
ALTER TABLE "public"."crafting_recipes" DISABLE TRIGGER ALL;
DELETE FROM "public"."crafting_recipes";
ALTER TABLE "public"."equipment_set_bonuses" DISABLE TRIGGER ALL;
DELETE FROM "public"."equipment_set_bonuses";
ALTER TABLE "public"."equipment_set_pieces" DISABLE TRIGGER ALL;
DELETE FROM "public"."equipment_set_pieces";
ALTER TABLE "public"."equipment_sets" DISABLE TRIGGER ALL;
DELETE FROM "public"."equipment_sets";
ALTER TABLE "public"."evolutions" DISABLE TRIGGER ALL;
DELETE FROM "public"."evolutions";
ALTER TABLE "public"."expedition_region_resources" DISABLE TRIGGER ALL;
DELETE FROM "public"."expedition_region_resources";
ALTER TABLE "public"."expedition_regions" DISABLE TRIGGER ALL;
DELETE FROM "public"."expedition_regions";
ALTER TABLE "public"."expedition_resource_items" DISABLE TRIGGER ALL;
DELETE FROM "public"."expedition_resource_items";
ALTER TABLE "public"."expedition_resources" DISABLE TRIGGER ALL;
DELETE FROM "public"."expedition_resources";
ALTER TABLE "public"."fishing_bait_affinities" DISABLE TRIGGER ALL;
DELETE FROM "public"."fishing_bait_affinities";
ALTER TABLE "public"."fishing_baits" DISABLE TRIGGER ALL;
DELETE FROM "public"."fishing_baits";
ALTER TABLE "public"."fishing_ports" DISABLE TRIGGER ALL;
DELETE FROM "public"."fishing_ports";
ALTER TABLE "public"."fishing_rod_properties" DISABLE TRIGGER ALL;
DELETE FROM "public"."fishing_rod_properties";
ALTER TABLE "public"."fishing_species" DISABLE TRIGGER ALL;
DELETE FROM "public"."fishing_species";
ALTER TABLE "public"."fishing_zone_species" DISABLE TRIGGER ALL;
DELETE FROM "public"."fishing_zone_species";
ALTER TABLE "public"."fishing_zones" DISABLE TRIGGER ALL;
DELETE FROM "public"."fishing_zones";
ALTER TABLE "public"."forge_bar_items" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_bar_items";
ALTER TABLE "public"."forge_blueprint_ingredients" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_blueprint_ingredients";
ALTER TABLE "public"."forge_blueprint_results" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_blueprint_results";
ALTER TABLE "public"."forge_blueprints" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_blueprints";
ALTER TABLE "public"."forge_recipes" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_recipes";
ALTER TABLE "public"."forge_scroll_ingredients" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_scroll_ingredients";
ALTER TABLE "public"."forge_scrolls" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_scrolls";
ALTER TABLE "public"."forge_tool_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_tool_effects";
ALTER TABLE "public"."forge_tool_properties" DISABLE TRIGGER ALL;
DELETE FROM "public"."forge_tool_properties";
ALTER TABLE "public"."global_buffs" DISABLE TRIGGER ALL;
DELETE FROM "public"."global_buffs";
ALTER TABLE "public"."guild_boss_abilities" DISABLE TRIGGER ALL;
DELETE FROM "public"."guild_boss_abilities";
ALTER TABLE "public"."guild_boss_configs" DISABLE TRIGGER ALL;
DELETE FROM "public"."guild_boss_configs";
ALTER TABLE "public"."guild_missions" DISABLE TRIGGER ALL;
DELETE FROM "public"."guild_missions";
ALTER TABLE "public"."item_rarity_attribute_overrides" DISABLE TRIGGER ALL;
DELETE FROM "public"."item_rarity_attribute_overrides";
ALTER TABLE "public"."marine_routes" DISABLE TRIGGER ALL;
DELETE FROM "public"."marine_routes";
ALTER TABLE "public"."missions" DISABLE TRIGGER ALL;
DELETE FROM "public"."missions";
ALTER TABLE "public"."monster_abilities" DISABLE TRIGGER ALL;
DELETE FROM "public"."monster_abilities";
ALTER TABLE "public"."monster_ability_conditions" DISABLE TRIGGER ALL;
DELETE FROM "public"."monster_ability_conditions";
ALTER TABLE "public"."monster_status_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."monster_status_effects";
ALTER TABLE "public"."music_assignments" DISABLE TRIGGER ALL;
DELETE FROM "public"."music_assignments";
ALTER TABLE "public"."music_config_versions" DISABLE TRIGGER ALL;
DELETE FROM "public"."music_config_versions";
ALTER TABLE "public"."music_pool_track_assignments" DISABLE TRIGGER ALL;
DELETE FROM "public"."music_pool_track_assignments";
ALTER TABLE "public"."music_pools" DISABLE TRIGGER ALL;
DELETE FROM "public"."music_pools";
ALTER TABLE "public"."music_tracks" DISABLE TRIGGER ALL;
DELETE FROM "public"."music_tracks";
ALTER TABLE "public"."nature_abilities" DISABLE TRIGGER ALL;
DELETE FROM "public"."nature_abilities";
ALTER TABLE "public"."power_books" DISABLE TRIGGER ALL;
DELETE FROM "public"."power_books";
ALTER TABLE "public"."power_combat_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."power_combat_effects";
ALTER TABLE "public"."power_status_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."power_status_effects";
ALTER TABLE "public"."pvp_seasons" DISABLE TRIGGER ALL;
DELETE FROM "public"."pvp_seasons";
ALTER TABLE "public"."tavern_games" DISABLE TRIGGER ALL;
DELETE FROM "public"."tavern_games";
ALTER TABLE "public"."tavern_menu_items" DISABLE TRIGGER ALL;
DELETE FROM "public"."tavern_menu_items";
ALTER TABLE "public"."titles" DISABLE TRIGGER ALL;
DELETE FROM "public"."titles";
ALTER TABLE "public"."unique_feats" DISABLE TRIGGER ALL;
DELETE FROM "public"."unique_feats";
ALTER TABLE "public"."unique_power_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."unique_power_effects";
ALTER TABLE "public"."vessels" DISABLE TRIGGER ALL;
DELETE FROM "public"."vessels";
ALTER TABLE "public"."weapon_status_effects" DISABLE TRIGGER ALL;
DELETE FROM "public"."weapon_status_effects";
ALTER TABLE "public"."wiki_articles" DISABLE TRIGGER ALL;
DELETE FROM "public"."wiki_articles";
ALTER TABLE "public"."world_boss_abilities" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_boss_abilities";
ALTER TABLE "public"."world_boss_activity_metrics" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_boss_activity_metrics";
ALTER TABLE "public"."world_boss_config_zones" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_boss_config_zones";
ALTER TABLE "public"."world_boss_configs" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_boss_configs";
ALTER TABLE "public"."world_boss_phases" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_boss_phases";
ALTER TABLE "public"."world_boss_ranking_rewards" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_boss_ranking_rewards";
ALTER TABLE "public"."world_boss_status_resistances" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_boss_status_resistances";
ALTER TABLE "public"."world_map_connections" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_map_connections";
ALTER TABLE "public"."world_map_nodes" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_map_nodes";
ALTER TABLE "public"."world_territories" DISABLE TRIGGER ALL;
DELETE FROM "public"."world_territories";
PRESQL
  cat "$DUMP_FILE"
  cat <<'POSTSQL'
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."AdventureMonsterLoots"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."AdventureMonsterLoots"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."AdventureMonsterLoots"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."AdventureMonsterLoots" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."AdventureMonsters"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."AdventureMonsters"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."AdventureMonsters"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."AdventureMonsters" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."AdventureZoneLoots"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."AdventureZoneLoots"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."AdventureZoneLoots"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."AdventureZoneLoots" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."AdventureZoneMonsters"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."AdventureZoneMonsters"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."AdventureZoneMonsters"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."AdventureZoneMonsters" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."AdventureZones"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."AdventureZones"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."AdventureZones"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."AdventureZones" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."ArmorProperties"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."ArmorProperties"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."ArmorProperties"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."ArmorProperties" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."Classes"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."Classes"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."Classes"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."Classes" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."GuildLevelConfig"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."GuildLevelConfig"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."GuildLevelConfig"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."GuildLevelConfig" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."Items"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."Items"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."Items"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."Items" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."Powers"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."Powers"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."Powers"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."Powers" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."RaceAbilities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."RaceAbilities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."RaceAbilities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."RaceAbilities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."Races"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."Races"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."Races"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."Races" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."WeaponProperties"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."WeaponProperties"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."WeaponProperties"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."WeaponProperties" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."achievements"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."achievements"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."achievements"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."achievements" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."admin_permissions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."admin_permissions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."admin_permissions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."admin_permissions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."admin_role_permissions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."admin_role_permissions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."admin_role_permissions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."admin_role_permissions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."admin_roles"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."admin_roles"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."admin_roles"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."admin_roles" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."adventure_guild_mission_rewards"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."adventure_guild_mission_rewards"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."adventure_guild_mission_rewards"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."adventure_guild_mission_rewards" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."adventure_guild_missions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."adventure_guild_missions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."adventure_guild_missions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."adventure_guild_missions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."adventure_guild_offers"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."adventure_guild_offers"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."adventure_guild_offers"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."adventure_guild_offers" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."alchemy_recipe_ingredients"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."alchemy_recipe_ingredients"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."alchemy_recipe_ingredients"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."alchemy_recipe_ingredients" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."alchemy_recipes"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."alchemy_recipes"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."alchemy_recipes"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."alchemy_recipes" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."class_abilities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."class_abilities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."class_abilities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."class_abilities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."class_evolution_abilities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."class_evolution_abilities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."class_evolution_abilities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."class_evolution_abilities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."class_evolution_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."class_evolution_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."class_evolution_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."class_evolution_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."class_evolution_paths"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."class_evolution_paths"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."class_evolution_paths"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."class_evolution_paths" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."class_evolution_requirements"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."class_evolution_requirements"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."class_evolution_requirements"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."class_evolution_requirements" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."consumable_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."consumable_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."consumable_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."consumable_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."consumable_properties"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."consumable_properties"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."consumable_properties"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."consumable_properties" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."crafting_recipe_ingredients"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."crafting_recipe_ingredients"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."crafting_recipe_ingredients"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."crafting_recipe_ingredients" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."crafting_recipes"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."crafting_recipes"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."crafting_recipes"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."crafting_recipes" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."equipment_set_bonuses"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."equipment_set_bonuses"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."equipment_set_bonuses"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."equipment_set_bonuses" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."equipment_set_pieces"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."equipment_set_pieces"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."equipment_set_pieces"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."equipment_set_pieces" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."equipment_sets"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."equipment_sets"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."equipment_sets"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."equipment_sets" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."evolutions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."evolutions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."evolutions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."evolutions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."expedition_region_resources"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."expedition_region_resources"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."expedition_region_resources"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."expedition_region_resources" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."expedition_regions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."expedition_regions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."expedition_regions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."expedition_regions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."expedition_resource_items"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."expedition_resource_items"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."expedition_resource_items"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."expedition_resource_items" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."expedition_resources"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."expedition_resources"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."expedition_resources"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."expedition_resources" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."fishing_bait_affinities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."fishing_bait_affinities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."fishing_bait_affinities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."fishing_bait_affinities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."fishing_baits"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."fishing_baits"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."fishing_baits"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."fishing_baits" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."fishing_ports"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."fishing_ports"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."fishing_ports"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."fishing_ports" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."fishing_rod_properties"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."fishing_rod_properties"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."fishing_rod_properties"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."fishing_rod_properties" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."fishing_species"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."fishing_species"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."fishing_species"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."fishing_species" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."fishing_zone_species"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."fishing_zone_species"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."fishing_zone_species"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."fishing_zone_species" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."fishing_zones"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."fishing_zones"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."fishing_zones"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."fishing_zones" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_bar_items"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_bar_items"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_bar_items"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_bar_items" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_blueprint_ingredients"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_blueprint_ingredients"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_blueprint_ingredients"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_blueprint_ingredients" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_blueprint_results"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_blueprint_results"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_blueprint_results"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_blueprint_results" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_blueprints"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_blueprints"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_blueprints"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_blueprints" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_recipes"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_recipes"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_recipes"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_recipes" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_scroll_ingredients"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_scroll_ingredients"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_scroll_ingredients"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_scroll_ingredients" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_scrolls"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_scrolls"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_scrolls"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_scrolls" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_tool_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_tool_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_tool_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_tool_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."forge_tool_properties"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."forge_tool_properties"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."forge_tool_properties"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."forge_tool_properties" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."global_buffs"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."global_buffs"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."global_buffs"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."global_buffs" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."guild_boss_abilities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."guild_boss_abilities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."guild_boss_abilities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."guild_boss_abilities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."guild_boss_configs"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."guild_boss_configs"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."guild_boss_configs"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."guild_boss_configs" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."guild_missions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."guild_missions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."guild_missions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."guild_missions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."item_rarity_attribute_overrides"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."item_rarity_attribute_overrides"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."item_rarity_attribute_overrides"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."item_rarity_attribute_overrides" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."marine_routes"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."marine_routes"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."marine_routes"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."marine_routes" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."missions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."missions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."missions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."missions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."monster_abilities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."monster_abilities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."monster_abilities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."monster_abilities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."monster_ability_conditions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."monster_ability_conditions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."monster_ability_conditions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."monster_ability_conditions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."monster_status_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."monster_status_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."monster_status_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."monster_status_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."music_assignments"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."music_assignments"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."music_assignments"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."music_assignments" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."music_config_versions"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."music_config_versions"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."music_config_versions"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."music_config_versions" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."music_pool_track_assignments"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."music_pool_track_assignments"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."music_pool_track_assignments"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."music_pool_track_assignments" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."music_pools"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."music_pools"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."music_pools"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."music_pools" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."music_tracks"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."music_tracks"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."music_tracks"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."music_tracks" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."nature_abilities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."nature_abilities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."nature_abilities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."nature_abilities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."power_books"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."power_books"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."power_books"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."power_books" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."power_combat_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."power_combat_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."power_combat_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."power_combat_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."power_status_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."power_status_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."power_status_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."power_status_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."pvp_seasons"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."pvp_seasons"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."pvp_seasons"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."pvp_seasons" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."tavern_games"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."tavern_games"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."tavern_games"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."tavern_games" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."tavern_menu_items"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."tavern_menu_items"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."tavern_menu_items"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."tavern_menu_items" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."titles"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."titles"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."titles"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."titles" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."unique_feats"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."unique_feats"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."unique_feats"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."unique_feats" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."unique_power_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."unique_power_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."unique_power_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."unique_power_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."vessels"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."vessels"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."vessels"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."vessels" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."weapon_status_effects"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."weapon_status_effects"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."weapon_status_effects"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."weapon_status_effects" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."wiki_articles"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."wiki_articles"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."wiki_articles"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."wiki_articles" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_boss_abilities"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_boss_abilities"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_boss_abilities"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_boss_abilities" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_boss_activity_metrics"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_boss_activity_metrics"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_boss_activity_metrics"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_boss_activity_metrics" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_boss_config_zones"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_boss_config_zones"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_boss_config_zones"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_boss_config_zones" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_boss_configs"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_boss_configs"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_boss_configs"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_boss_configs" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_boss_phases"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_boss_phases"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_boss_phases"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_boss_phases" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_boss_ranking_rewards"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_boss_ranking_rewards"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_boss_ranking_rewards"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_boss_ranking_rewards" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_boss_status_resistances"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_boss_status_resistances"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_boss_status_resistances"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_boss_status_resistances" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_map_connections"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_map_connections"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_map_connections"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_map_connections" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_map_nodes"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_map_nodes"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_map_nodes"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_map_nodes" ENABLE TRIGGER ALL;
DO $$
DECLARE pk_col text; seq regclass;
BEGIN
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"public"."world_territories"'::regclass AND i.indisprimary
  LIMIT 1;
  IF pk_col IS NOT NULL THEN
    seq := pg_get_serial_sequence('"public"."world_territories"', pk_col);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM "public"."world_territories"), 1))', seq, pk_col);
    END IF;
  END IF;
END $$;
ALTER TABLE "public"."world_territories" ENABLE TRIGGER ALL;
POSTSQL
  echo "COMMIT;"
} | psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1

echo "==> Pronto. Catálogo de produção replicado pro teste -- sem mídia, sem usuário/personagem/guilda real."
echo "    Dump ficou salvo em $DUMP_FILE (contém só catálogo, sem PII) -- apague se não precisar mais: rm $DUMP_FILE"
