"use strict";

// As migrations 20260930510000 (36 poderes novos) e 20260930620000
// (evoluções de natureza restantes) ficaram marcadas como aplicadas em
// SequelizeMeta, mas os dados nunca foram gravados nesta base — a
// tabela evolutions estava vazia e nenhum dos 36 poderes existia
// (causa exata não identificada, mas o efeito é reproduzível: os dois
// arquivos são idempotentes por nome, então basta chamar `up()` de
// novo pra preencher o que faltou, sem duplicar nada que já exista).
// Esta migration também aplica o imagem_url de cada Power cujo nome
// bate com um arquivo em public/habilidades_game (ver correção de
// resolveMediaUrl no frontend, commit anterior) — nenhuma dessas
// imagens carregava antes por dois motivos empilhados: acento/espaço
// no nome do arquivo (já corrigido) e resolveMediaUrl reescrevendo o
// caminho pro backend (também já corrigido).
const HABILIDADES_IMAGENS = {
  "Couraça de Batalha": "/habilidades_game/habilidades_game/Guerreiro/Base/couraca-de-batalha.png",
  "Fluxo Arcano": "/habilidades_game/habilidades_game/Mago/Base/fluxo-arcano.png",
  "Adaptação Rápida": "/habilidades_game/habilidades_game/racas/Humano/adaptacao-rapida.png",
  "Graça Élfica": "/habilidades_game/habilidades_game/racas/Elfo/graca-elfica.png",
  "Pele de Granito": "/habilidades_game/habilidades_game/racas/anao/pele-de-granito.png",
  "Sangue Selvagem": "/habilidades_game/habilidades_game/racas/Orc/sangue-selvagem.png",
  "Bênção Celestial": "/habilidades_game/habilidades_game/racas/Celestial/bencao-celestial.png",
  "Corte Selvagem": "/habilidades_game/habilidades_game/Guerreiro/Base/corte-selvagem.png",
  "Investida Relâmpago": "/habilidades_game/habilidades_game/Guerreiro/Base/investida-relampago.png",
  "Golpe Retumbante": "/habilidades_game/habilidades_game/Guerreiro/Base/golpe-retumbante.png",
  "Instinto Assassino": "/habilidades_game/habilidades_game/Guerreiro/Base/instinto-assassino.png",
  "Investida Devastadora": "/habilidades_game/habilidades_game/Guerreiro/Base/investida-devastadora.png",
  "Pele de Ferro": "/habilidades_game/habilidades_game/Guerreiro/Base/pele-de-ferro.png",
  "Fúria Implacável": "/habilidades_game/habilidades_game/Guerreiro/Base/furia-implacavel.png",
  "Golpe do Titã": "/habilidades_game/habilidades_game/Guerreiro/Base/golpe-do-tita.png",
  "Mísseis Arcanos": "/habilidades_game/habilidades_game/Mago/Base/misseis-arcanos.png",
  "Escudo de Mana": "/habilidades_game/habilidades_game/Mago/Base/escudo-de-mana.png",
  "Corrente Arcana": "/habilidades_game/habilidades_game/Mago/Base/corrente-arcana.png",
  "Mente Afiada": "/habilidades_game/habilidades_game/Mago/Base/mente-afiada.png",
  "Nova Congelante": "/habilidades_game/habilidades_game/Mago/Base/nova-congelante.png",
  "Reserva Arcana": "/habilidades_game/habilidades_game/Mago/Base/reserva-arcana.png",
  "Tempestade Arcana": "/habilidades_game/habilidades_game/Mago/Base/tempestade-arcana.png",
  "Colapso Dimensional": "/habilidades_game/habilidades_game/Mago/Base/colapso-dimensional.png",
  "Determinação": "/habilidades_game/habilidades_game/racas/Humano/determinacao.png",
  "Coração Resiliente": "/habilidades_game/habilidades_game/racas/Humano/coracao-resiliente.png",
  "Fúria Silenciosa": "/habilidades_game/habilidades_game/racas/Humano/furia-silenciosa.png",
  "Instinto de Sobrevivência": "/habilidades_game/habilidades_game/racas/Humano/instinto-de-sobrevivencia.png",
  "Passo Élfico": "/habilidades_game/habilidades_game/racas/Elfo/passo-elfico.png",
  "Chuva de Flechas": "/habilidades_game/habilidades_game/racas/Elfo/chuva-de-flechas.png",
  "Reflexos Élficos": "/habilidades_game/habilidades_game/racas/Elfo/reflexos-elficos.png",
  "Dança das Lâminas": "/habilidades_game/habilidades_game/racas/Elfo/danca-das-laminas.png",
  "Golpe de Martelo": "/habilidades_game/habilidades_game/racas/anao/golpe-de-martelo.png",
  "Fúria da Montanha": "/habilidades_game/habilidades_game/racas/anao/furia-da-montanha.png",
  "Couraça de Pedra": "/habilidades_game/habilidades_game/racas/anao/couraca-de-pedra.png",
  "Terremoto Anão": "/habilidades_game/habilidades_game/racas/anao/terremoto-anao.png",
  "Investida Bruta": "/habilidades_game/habilidades_game/racas/Orc/investida-bruta.png",
  "Machadada Selvagem": "/habilidades_game/habilidades_game/racas/Orc/machadada-selvagem.png",
  "Fúria Interminável": "/habilidades_game/habilidades_game/racas/Orc/furia-interminavel.png",
  "Sede de Sangue": "/habilidades_game/habilidades_game/racas/Orc/sede-de-sangue.png",
  "Aura Sagrada": "/habilidades_game/habilidades_game/racas/Celestial/aura-sagrada.png",
  "Luz Interior": "/habilidades_game/habilidades_game/racas/Celestial/luz-interior.png",
  "Ira Celestial": "/habilidades_game/habilidades_game/racas/Celestial/ira-celestial.png",
  "Julgamento Final": "/habilidades_game/habilidades_game/racas/Celestial/julgamento-final.png",
  "Lâmina Flamejante": "/habilidades_game/habilidades_game/Guerreiro/Atributos/lamina-flamejante.png",
  "Erupção Arcana": "/habilidades_game/habilidades_game/Mago/Atributos/erupcao-arcana.png",
  "Golpe da Maré": "/habilidades_game/habilidades_game/Guerreiro/Atributos/golpe-da-mare.png",
  "Maré Curativa": "/habilidades_game/habilidades_game/Mago/Atributos/mare-curativa.png",
  "Investida Telúrica": "/habilidades_game/habilidades_game/Guerreiro/Atributos/investida-telurica.png",
  "Colapso Telúrico": "/habilidades_game/habilidades_game/Mago/Atributos/colapso-telurico.png",
  "Bênção Radiante": "/habilidades_game/habilidades_game/Guerreiro/Atributos/bencao-radiante.png",
  "Raio de Cura Maior": "/habilidades_game/habilidades_game/Mago/Atributos/raio-de-cura-maior.png",
  "Golpe Relâmpago": "/habilidades_game/habilidades_game/Guerreiro/Atributos/golpe-relampago.png",
  "Descarga Total": "/habilidades_game/habilidades_game/Mago/Atributos/descarga-total.png",
  "Golpe do Equilíbrio": "/habilidades_game/habilidades_game/Guerreiro/Atributos/golpe-do-equilibrio.png",
  "Ciclo Vital": "/habilidades_game/habilidades_game/Mago/Atributos/ciclo-vital.png",
};

module.exports = {
  async up(queryInterface) {
    // Passo 1: reaplica as duas migrations de conteúdo que ficaram
    // registradas como executadas sem gravar dado nenhum. Ambas usam
    // "SELECT antes de INSERT" por nome — reexecutar é seguro mesmo se
    // parte dos dados já existir.
    // eslint-disable-next-line global-require
    const migPoderes = require("./20260930510000-muitos-poderes-novos.js");
    // eslint-disable-next-line global-require
    const migEvolucoes = require("./20260930620000-evolucoes-naturezas-restantes.js");
    await migPoderes.up(queryInterface);
    await migEvolucoes.up(queryInterface);

    // Passo 2: aplica a imagem de cada Power cujo nome bate com um
    // arquivo em public/habilidades_game.
    for (const [nome, imagemUrl] of Object.entries(HABILIDADES_IMAGENS)) {
      await queryInterface.sequelize.query(
        `UPDATE "Powers" SET imagem_url = :imagemUrl, "updatedAt" = now() WHERE nome = :nome;`,
        { replacements: { nome, imagemUrl } },
      );
    }

    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Habilidades' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Habilidades 2.0 já existe — pulando.");
      return;
    }
    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );
    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Habilidades', '2.0', 'Novos poderes de classe/raça com arte própria',
         'Corrigido um problema em que 48 habilidades novas de Guerreiro, Mago e das 5 raças (Humano, Elfo, Anão, Orc, Celestial) nunca chegavam a ser criadas de verdade, apesar de já estarem "prontas" nos bastidores. Agora todas existem e mostram o ícone correto.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down() {
    // Corretivo de dados — não desfaz (as próprias migrations de
    // origem já têm seu down() se algum dia precisar reverter tudo).
  },
};
