// Guild-scoped slash commands; no Message Content intent or generative model.
const textOption = (name, description) => ({
  type: 3,
  name,
  description,
  required: true,
  max_length: 100,
  min_length: 2,
});
const commands = [
  {
    name: "caelum-ajuda",
    description: "Conheça os comandos e as fontes oficiais do News Caelum",
    type: 1,
  },
  {
    name: "caelum-habilidade",
    description:
      "Consulte dano base, escalamento e custo atuais de uma habilidade",
    type: 1,
    options: [textOption("nome", "Nome da habilidade")],
  },
  {
    name: "caelum-mudancas",
    description:
      "Consulte alterações de habilidade aprovadas, com valores antes e depois",
    type: 1,
    options: [textOption("nome", "Nome da habilidade")],
  },
  {
    name: "caelum-noticias",
    description: "Veja os patch notes já publicados no jogo",
    type: 1,
  },
  {
    name: "caelum-guia",
    description: "Consulte um artigo publicado da Wiki oficial",
    type: 1,
    options: [textOption("assunto", "Título ou assunto do artigo")],
  },
];
module.exports = { commands };
