"use strict";

// Ajuste pedido pelo jogador: a Evolução de Classe tinha "só um
// bônusinho" — a intenção dela é ser um salto de poder GRANDE, mas
// difícil de alcançar de verdade. Duas mudanças:
// 1) Bônus de atributo de cada caminho sobe ~2.2x (era pra ser um
//    "absurdo" bem maior que qualquer coisa de nível mais baixo).
// 2) Cada caminho ganha um requisito de caça — matar 150 vezes um
//    monstro específico (ver character_monster_kills), além do nível e
//    da relíquia que já existiam. Ex. literal do jogador: Berserker
//    pede 150 Minotauros.
const AJUSTES = [
  {
    nome: "Berserker",
    nomeMonstroAlvo: "Minotauro",
    quantidadeMonstro: 150,
    bonus_forca: 45,
    bonus_vitalidade: 0,
    bonus_agilidade: 15,
    bonus_inteligencia: 0,
    bonus_velocidade: 15,
  },
  {
    nome: "Paladino",
    nomeMonstroAlvo: "Golem de Pedra",
    quantidadeMonstro: 150,
    bonus_forca: 18,
    bonus_vitalidade: 45,
    bonus_agilidade: 0,
    bonus_inteligencia: 0,
    bonus_velocidade: 0,
  },
  {
    nome: "Cavaleiro Real",
    nomeMonstroAlvo: "Orc Guerreiro",
    quantidadeMonstro: 150,
    bonus_forca: 22,
    bonus_vitalidade: 22,
    bonus_agilidade: 22,
    bonus_inteligencia: 0,
    bonus_velocidade: 0,
  },
  {
    nome: "Arquimago Eterno",
    nomeMonstroAlvo: "Draconídeo Jovem",
    quantidadeMonstro: 150,
    bonus_forca: 0,
    bonus_vitalidade: 0,
    bonus_agilidade: 14,
    bonus_inteligencia: 48,
    bonus_velocidade: 0,
  },
  {
    nome: "Nigromante",
    nomeMonstroAlvo: "Espectro Sussurrante",
    quantidadeMonstro: 150,
    bonus_forca: 0,
    bonus_vitalidade: 30,
    bonus_agilidade: 0,
    bonus_inteligencia: 30,
    bonus_velocidade: 0,
  },
  {
    nome: "Feiticeiro Arcano",
    nomeMonstroAlvo: "Cultista Renegado",
    quantidadeMonstro: 150,
    bonus_forca: 0,
    bonus_vitalidade: 0,
    bonus_agilidade: 14,
    bonus_inteligencia: 26,
    bonus_velocidade: 18,
  },
];

module.exports = {
  async up(queryInterface) {
    for (const ajuste of AJUSTES) {
      await queryInterface.sequelize.query(
        `UPDATE class_evolution_paths
         SET nome_monstro_alvo = :nome_monstro_alvo,
             quantidade_monstro_necessaria = :quantidade_monstro,
             bonus_forca = :bonus_forca,
             bonus_vitalidade = :bonus_vitalidade,
             bonus_agilidade = :bonus_agilidade,
             bonus_inteligencia = :bonus_inteligencia,
             bonus_velocidade = :bonus_velocidade,
             "updatedAt" = now()
         WHERE nome = :nome;`,
        {
          replacements: {
            nome: ajuste.nome,
            nome_monstro_alvo: ajuste.nomeMonstroAlvo,
            quantidade_monstro: ajuste.quantidadeMonstro,
            bonus_forca: ajuste.bonus_forca,
            bonus_vitalidade: ajuste.bonus_vitalidade,
            bonus_agilidade: ajuste.bonus_agilidade,
            bonus_inteligencia: ajuste.bonus_inteligencia,
            bonus_velocidade: ajuste.bonus_velocidade,
          },
        },
      );
    }
    console.log("[migration] Requisito de caça + bônus maiores aplicados aos 6 caminhos de evolução de classe.");
  },

  async down() {
    // Não reverte pros valores antigos — não vale a pena versionar o
    // estado "pré-buff" separadamente. Quem quiser voltar restaura o
    // banco de um backup anterior a esta migration.
  },
};
