"use strict";

// Define imagem_url pros itens de Capacete/Armadura (Torso/Maos/Pes) que
// nunca tiveram ícone, troca os ícones antigos (craftpix) de Escudo pelos
// novos artes customizadas, e troca a Espada de Ferro que usava um webp
// genérico (/images/sword-basic.webp) por um ícone próprio. Todos os
// caminhos apontam pra arquivos já publicados em CaelumFront-new sob
// public/icons/. Idempotente: só atualiza o que ainda não bate com o
// valor alvo, então rodar de novo não faz nada.
module.exports = {
  async up(queryInterface) {
    const atualizacoes = [
      // Capacetes
      ["Elmo de Couro", "/icons/helmets/elmo-de-couro.png"],
      ["Elmo de Ferro", "/icons/helmets/elmo-de-ferro.png"],
      ["Diadema Élfico", "/icons/helmets/diadema-elfico.png"],
      ["Elmo Sombrio", "/icons/helmets/elmo-sombrio.png"],
      ["Elmo Dracônico", "/icons/helmets/elmo-draconico.png"],
      // Escudos (substitui craftpix)
      ["Escudo de Madeira", "/icons/shields/escudo-madeira.png"],
      ["Escudo de Ferro", "/icons/shields/escudo-ferro.png"],
      ["Escudo do Guardião", "/icons/shields/escudo-guardiao.png"],
      ["Bastião Inabalável", "/icons/shields/bastiao-inabalavel.png"],
      ["Escudo do Último Baluarte", "/icons/shields/escudo-ultimo-baluarte.png"],
      // Armadura - Torso
      ["Peitoral de Couro", "/icons/armor/torso/peitoral-de-couro.png"],
      ["Peitoral de Ferro", "/icons/armor/torso/peitoral-de-ferro.png"],
      ["Manto Élfico", "/icons/armor/torso/manto-elfico.png"],
      ["Peitoral Sombrio", "/icons/armor/torso/peitoral-sombrio.png"],
      ["Peitoral Dracônico", "/icons/armor/torso/peitoral-draconico.png"],
      // Armadura - Pes
      ["Botas de Couro", "/icons/armor/boots/botas-de-couro.png"],
      ["Botas de Ferro", "/icons/armor/boots/botas-de-ferro.png"],
      ["Botas Élficas", "/icons/armor/boots/botas-elficas.png"],
      ["Botas Sombrias", "/icons/armor/boots/botas-sombrias.png"],
      ["Botas Dracônicas", "/icons/armor/boots/botas-draconicas.png"],
      // Armas - Espada
      ["Espada Curta de Bronze", "/icons/weapons/swords/espada-curta-de-bronze.png"],
      ["Espada de Ferro", "/icons/weapons/swords/espada-de-ferro.png"],
      ["Espada Élfica", "/icons/weapons/swords/espada-elfica.png"],
      ["Espada do Rei Adormecido", "/icons/weapons/swords/espada-do-rei-adormecido.png"],
      // Armas - Cajado
      ["Cajado do Aprendiz", "/icons/weapons/staffs/cajado-do-aprendiz.png"],
      ["Cajado Sussurrante", "/icons/weapons/staffs/cajado-sussurrante.png"],
      ["Cajado do Arquimago", "/icons/weapons/staffs/cajado-do-arquimago.png"],
      ["Cajado das Mil Tempestades", "/icons/weapons/staffs/cajado-das-mil-tempestades.png"],
    ];

    for (const [nome, imagemUrl] of atualizacoes) {
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagemUrl WHERE nome = :nome AND imagem_url IS DISTINCT FROM :imagemUrl;`,
        { replacements: { nome, imagemUrl } },
      );
    }
  },

  async down() {},
};
