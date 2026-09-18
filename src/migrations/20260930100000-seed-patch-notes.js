"use strict";

// Histórico retroativo — cobre as mudanças recentes de cada
// funcionalidade, versionadas por FUNCIONALIDADE (não uma versão geral
// do jogo): "Forja 1.0 → 2.0" pra uma reformulação completa, "x.1" pra
// ajuste pontual (nome, ícone, detalhe visual) na mesma versão maior.
const NOTAS = [
  {
    feature: "Criação de Personagem",
    versao: "1.1",
    titulo: "Raças e classes raras não vazam mais pra seleção normal",
    descricao:
      "Corrigido um bug em que a raça Primordial podia aparecer na grade normal de criação — raças e classes raras (como Celestial e Primordial) só devem aparecer via o sorteio especial de 0,9%.",
  },
  {
    feature: "Criação de Personagem",
    versao: "1.2",
    titulo: "Mensagem de bênção só aparece pra quem realmente ganhou o sorteio",
    descricao:
      "A mensagem \"os Deuses o abençoaram\" na seleção de classe estava aparecendo pra qualquer jogador que confirmasse a classe, mesmo sem ter tirado a sorte de 0,9%. Agora só aparece em quem realmente ganhou.",
  },
  {
    feature: "Meu Personagem",
    versao: "2.0",
    titulo: "Redesenho completo em 6 abas",
    descricao:
      "A página do personagem virou 6 abas: Equipamentos, Habilidades, Status, Classe, Combate e Informações — no lugar de tudo empilhado numa página só.",
  },
  {
    feature: "Vida e Mana",
    versao: "1.0",
    titulo: "Barra de Vida e Mana sempre visíveis no menu lateral",
    descricao:
      "Agora dá pra ver sua Vida e Mana em qualquer tela do jogo, direto na barra lateral — antes só dava pra ver entrando na aba Status.",
  },
  {
    feature: "Meu Personagem",
    versao: "2.1",
    titulo: "Status mostra seu sexo e explica a Natureza Mágica",
    descricao:
      "O botão de trocar de sexo agora mostra qual é o seu sexo atual (antes era só um ícone sem contexto), e a Natureza Mágica ganhou uma explicação de pra que ela serve. A barra de Vida saiu da aba Status — ela já vive na barra lateral.",
  },
  {
    feature: "Meu Inventário",
    versao: "2.0",
    titulo: "Reformulado em 3 abas",
    descricao:
      "Meus Equipamentos, Meus Materiais e Meus Consumíveis — organizado por categoria, no lugar de uma lista só.",
  },
  {
    feature: "Equipamentos",
    versao: "1.0",
    titulo: "Acessórios de verdade: Anel e Colar",
    descricao:
      "Dois novos slots de equipamento — Anel e Colar — com itens de Comum a Lendário, cada um com bônus de atributo próprio.",
  },
  {
    feature: "Equipamentos",
    versao: "1.1",
    titulo: "Ícones customizados pra praticamente todo equipamento",
    descricao:
      "Capacetes, armaduras, escudos, espadas, cajados, anéis e colares ganharam arte própria — a maioria não tinha ícone nenhum antes, e os poucos que tinham eram só placeholder.",
  },
  {
    feature: "Equipamentos",
    versao: "1.2",
    titulo: "Tooltip de atributos + borda colorida por raridade",
    descricao:
      "Passe o mouse em qualquer item equipado ou no inventário pra ver Defesa/Dano/bônus de atributo na hora, sem precisar equipar pra descobrir. A borda de cada item agora também é colorida pela raridade (cinza, verde, azul, roxo, laranja, vermelho).",
  },
  {
    feature: "Habilidades",
    versao: "1.1",
    titulo: "Ícones customizados pras 21 habilidades do jogo",
    descricao:
      "Todas as habilidades de Guerreiro e Mago, e as de evolução de natureza mágica, ganharam ícone próprio — nenhuma fica mais sem imagem.",
  },
  {
    feature: "Menu",
    versao: "1.1",
    titulo: "Forja e Mercado ganham ícone próprio",
    descricao:
      "Os dois reaproveitavam o ícone genérico da Loja — agora Forja tem uma bigorna e Mercado tem uma barraca, do mesmo jeito que os outros itens do menu.",
  },
  {
    feature: "Forja",
    versao: "2.0",
    titulo: "Receita fixa por item — sem sorteio de resultado",
    descricao:
      "A Forja não funde mais itens aleatórios da mesma categoria num prêmio sorteado (podia sair uma espada quando você queria um cajado). Agora cada item tem sua própria receita: materiais específicos, tempo de forja e custo em ouro — você escolhe o que forjar e recebe exatamente aquilo. Raridades mais altas pedem mais materiais e um tempo bem mais longo (um Lendário pode levar 12 horas), e a forja roda em segundo plano: pode fechar o jogo e voltar depois pra coletar.",
  },
];

module.exports = {
  async up(queryInterface) {
    const [existentes] = await queryInterface.sequelize.query(`SELECT titulo FROM patch_notes;`);
    const titulosExistentes = new Set(existentes.map((linha) => linha.titulo));

    let ordem = 1;
    for (const nota of NOTAS) {
      if (titulosExistentes.has(nota.titulo)) {
        console.log(`[migration] Nota "${nota.titulo}" já existe — pulando.`);
        ordem += 1;
        continue;
      }
      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, :feature, :versao, :titulo, :descricao, CURRENT_DATE, now(), now());`,
        { replacements: { ordem, ...nota } },
      );
      ordem += 1;
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", null);
  },
};
