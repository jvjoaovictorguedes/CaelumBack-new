"use strict";

// Painel Administrativo de Músicas — Fase 1: seed que espelha
// EXATAMENTE o estado atual (constants/music.ts do frontend +
// page->track hoje hardcoded em cada src/app/dashboard/**/page.tsx +
// FAIXAS_COMBATE/FAIXAS_MAPA) antes de qualquer edição pelo Admin
// (spec §14.1). Cria: 12 tracks reais + versão 1 de cada (bytes lidos
// de src/seed-assets/music/, cópia local dos MP3 hoje servidos por
// CaelumFront-new/public/audio/music/ — mantidos aqui pro backend ser
// autossuficiente), pools "combat" e "map" com membership igual aos
// arrays hardcoded, e uma MusicConfigVersion v1 PUBLISHED com os
// assignments de página/contexto de hoje.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { estimarDuracaoMs } = require("../utils/mp3Duration");

const ASSETS_DIR = path.resolve(__dirname, "..", "seed-assets", "music");

// key -> { nome, arquivo, loop }. Espelha CaelumFront-new/src/constants/music.ts (MUSIC).
const TRACKS = [
  { key: "guilda", nome: "Guilda", arquivo: "GUILDA.mp3" },
  { key: "aventureiro", nome: "Aventureiro (Inventário/Equipamento/Guia)", arquivo: "INVENTARIO-EQUIPAMENTO-GUIA DO AVENTUREIRO.mp3" },
  { key: "ambiente", nome: "Ambiente", arquivo: "AMBIENTE.mp3" },
  { key: "mapa", nome: "Mapa", arquivo: "MAPA.mp3" },
  { key: "mapa-medieval", nome: "Mapa Medieval", arquivo: "MEDIEVAL - MAPA.mp3" },
  { key: "combate", nome: "Combate", arquivo: "COMBATE.mp3" },
  { key: "combate1", nome: "Combate 1", arquivo: "COMBATE1.mp3" },
  { key: "combate2", nome: "Combate 2", arquivo: "COMBATE2.mp3" },
  { key: "combate3", nome: "Combate 3", arquivo: "COMBATE3.mp3" },
  { key: "animada", nome: "Animada", arquivo: "ANIMADA.mp3" },
  { key: "bestiario", nome: "Bestiário", arquivo: "BESTIARIO.mp3" },
  { key: "taverna-mercado", nome: "Taverna/Mercado", arquivo: "MUSICA TAVERNA-MERCADO.mp3" },
];

// slot_key -> track key. Espelha o <PageMusic track={MUSIC.X} /> real de
// cada página hoje (levantado em CaelumFront-new/src/app/dashboard/**).
const PAGE_ASSIGNMENTS = {
  PAGE_ADVENTURE: "ambiente",
  PAGE_GUIDE: "aventureiro",
  PAGE_CHARACTER: "ambiente",
  PAGE_INVENTORY: "aventureiro",
  PAGE_SHOP: "taverna-mercado",
  PAGE_MARKET: "taverna-mercado",
  PAGE_FORGE: "aventureiro",
  PAGE_GUILDS: "guilda",
  PAGE_QUESTS: "guilda",
  PAGE_MESSAGES: "ambiente",
  PAGE_BESTIARY: "bestiario",
  PAGE_TAVERN: "guilda",
  PAGE_PVP: "animada",
  PAGE_FISHING: "ambiente",
};

// PAGE_MAP e CONTEXT_COMBAT_PVE são POOL (sortearFaixaMapa/sortearFaixaCombate hoje).
const POOL_ASSIGNMENTS = {
  PAGE_MAP: "map",
  CONTEXT_COMBAT_PVE: "combat",
};

// Contextos que hoje não têm música própria em código (PvP/Boss ainda
// não chamam requestMusic com faixa específica) — seed como SILENCE,
// preserva "sem som próprio" até o Admin escolher uma faixa/pool.
const SILENCE_ASSIGNMENTS = ["CONTEXT_PVP", "CONTEXT_GUILD_BOSS", "CONTEXT_WORLD_BOSS"];

const POOLS = {
  map: { nome: "Mapa", tracks: ["mapa", "mapa-medieval"] },
  combat: { nome: "Combate", tracks: ["combate", "combate1", "combate2", "combate3"] },
};

module.exports = {
  async up(queryInterface) {
    const [jaTemTracks] = await queryInterface.sequelize.query(`SELECT id FROM music_tracks LIMIT 1;`);
    if (jaTemTracks.length > 0) {
      console.log("[migration] music_tracks já populado — pulando seed do estado atual.");
      return;
    }

    const idPorKeyTrack = {};
    for (const { key, nome, arquivo } of TRACKS) {
      const [[track]] = await queryInterface.sequelize.query(
        `INSERT INTO music_tracks (key, nome, loop, ativo, "createdAt", "updatedAt")
         VALUES (:key, :nome, true, true, now(), now()) RETURNING id;`,
        { replacements: { key, nome } },
      );
      idPorKeyTrack[key] = track.id;

      const caminhoArquivo = path.join(ASSETS_DIR, arquivo);
      if (!fs.existsSync(caminhoArquivo)) {
        console.warn(`[migration] Arquivo de seed ausente pra "${key}" (${arquivo}) — track criada sem versão 1.`);
        continue;
      }
      const buffer = fs.readFileSync(caminhoArquivo);
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
      const duracaoMs = estimarDuracaoMs(buffer);

      await queryInterface.sequelize.query(
        `INSERT INTO music_track_file_versions
           (id_track, versao, nome_arquivo_original, mime, tamanho_bytes, duracao_ms, dados, checksum_sha256, ativo, "createdAt", "updatedAt")
         VALUES (:idTrack, 1, :nomeArquivo, 'audio/mpeg', :tamanho, :duracaoMs, :dados, :checksum, true, now(), now());`,
        {
          replacements: {
            idTrack: track.id,
            nomeArquivo: arquivo,
            tamanho: buffer.length,
            duracaoMs,
            dados: buffer,
            checksum,
          },
        },
      );
    }

    const idPorKeyPool = {};
    for (const [poolKey, { nome }] of Object.entries(POOLS)) {
      const [[pool]] = await queryInterface.sequelize.query(
        `INSERT INTO music_pools (key, nome, ativo, "createdAt", "updatedAt")
         VALUES (:key, :nome, true, now(), now()) RETURNING id;`,
        { replacements: { key: poolKey, nome } },
      );
      idPorKeyPool[poolKey] = pool.id;
    }

    const [[configVersion]] = await queryInterface.sequelize.query(
      `INSERT INTO music_config_versions (version_number, status, notes, published_at, "createdAt", "updatedAt")
       VALUES (1, 'PUBLISHED', 'Seed inicial — espelha o estado hardcoded anterior ao Painel de Músicas.', now(), now(), now())
       RETURNING id;`,
    );

    for (const [poolKey, { tracks }] of Object.entries(POOLS)) {
      let ordem = 0;
      for (const trackKey of tracks) {
        ordem += 1;
        await queryInterface.sequelize.query(
          `INSERT INTO music_pool_track_assignments (id_config_version, id_pool, id_track, peso, ordem, "createdAt", "updatedAt")
           VALUES (:idConfig, :idPool, :idTrack, 1, :ordem, now(), now());`,
          {
            replacements: {
              idConfig: configVersion.id,
              idPool: idPorKeyPool[poolKey],
              idTrack: idPorKeyTrack[trackKey],
              ordem,
            },
          },
        );
      }
    }

    for (const [slotKey, trackKey] of Object.entries(PAGE_ASSIGNMENTS)) {
      await queryInterface.sequelize.query(
        `INSERT INTO music_assignments (id_config_version, slot_key, assignment_type, id_track, "createdAt", "updatedAt")
         VALUES (:idConfig, :slotKey, 'TRACK', :idTrack, now(), now());`,
        { replacements: { idConfig: configVersion.id, slotKey, idTrack: idPorKeyTrack[trackKey] } },
      );
    }

    for (const [slotKey, poolKey] of Object.entries(POOL_ASSIGNMENTS)) {
      await queryInterface.sequelize.query(
        `INSERT INTO music_assignments (id_config_version, slot_key, assignment_type, id_pool, "createdAt", "updatedAt")
         VALUES (:idConfig, :slotKey, 'POOL', :idPool, now(), now());`,
        { replacements: { idConfig: configVersion.id, slotKey, idPool: idPorKeyPool[poolKey] } },
      );
    }

    for (const slotKey of SILENCE_ASSIGNMENTS) {
      await queryInterface.sequelize.query(
        `INSERT INTO music_assignments (id_config_version, slot_key, assignment_type, "createdAt", "updatedAt")
         VALUES (:idConfig, :slotKey, 'SILENCE', now(), now());`,
        { replacements: { idConfig: configVersion.id, slotKey } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM music_pool_track_assignments;`);
    await queryInterface.sequelize.query(`DELETE FROM music_assignments;`);
    await queryInterface.sequelize.query(`DELETE FROM music_config_versions;`);
    await queryInterface.sequelize.query(`DELETE FROM music_track_file_versions;`);
    await queryInterface.sequelize.query(`DELETE FROM music_pools;`);
    await queryInterface.sequelize.query(`DELETE FROM music_tracks;`);
  },
};
