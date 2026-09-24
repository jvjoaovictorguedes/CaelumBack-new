"use strict";

// Colisão de patch note: minha migration 20261101020000 e a
// 20261105090000 (de outra sessão) usaram o mesmo par feature/versão
// ("Aventura"/"4.7") pra descrever dois bugs DIFERENTES do mesmo
// sintoma (Aventura pulava a seleção de zona): a 20261105090000
// descreve o fix do botão de VITÓRIA (já corrigido antes), a minha
// descreve o fix do botão de DERROTA (o gap que sobrava). Como a minha
// rodou primeiro, a checagem idempotente da outra viu "já existe" e
// pulou — a nota da vitória nunca foi inserida. Aqui: minha nota vira
// 4.8, e a nota da vitória (4.7) entra do jeito que a 20261105090000
// pretendia.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE patch_notes SET versao = '4.8'
       WHERE feature = 'Aventura' AND versao = '4.7'
         AND titulo = 'Corrigido: derrota também podia prender no mesmo encontro';`,
    );

    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '4.7' LIMIT 1;`,
    );
    if (existente.length === 0) {
      const [[{ max }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
      );
      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, 'Aventura', '4.7', 'Corrige ficar preso no mesmo monstro',
           'Sair da Aventura pelo botão da tela de vitória, logo depois de matar o monstro, não deixa mais o jogador preso no mesmo encontro ao voltar — agora sempre retorna pra seleção de área corretamente.',
           CURRENT_DATE, now(), now());`,
        { replacements: { ordem: max + 1 } },
      );
    }
  },

  async down() {
    // Correção de dados pontual — sem reversão automática (voltar
    // deixaria a nota de derrota apagada e a colisão de volta).
  },
};
