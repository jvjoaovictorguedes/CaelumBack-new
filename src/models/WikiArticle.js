const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Wiki do Jogo — artigos de referência pro jogador (mecânicas, sistemas,
// fórmulas em linguagem simples), organizados por categoria livre
// (mesma convenção de PatchNote.feature: STRING solta, sem ENUM rígido
// — o admin cria categorias novas só escrevendo o nome, sem migration).
// conteudo é TEXTO PLANO com parágrafos separados por linha em branco
// (mesma convenção de PatchNote.descricao) — sem markdown, esta base
// nunca usou uma lib de markdown em lugar nenhum.
const WikiArticle = sequelize.define(
  "WikiArticle",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    categoria: { type: DataTypes.STRING(60), allowNull: false },
    // URL amigável (/dashboard/wiki/<slug>) — único, minúsculo,
    // hifenizado; validado no service, nunca no model.
    slug: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    titulo: { type: DataTypes.STRING(200), allowNull: false },
    // Resumo curto pra listagem/sidebar — sem isso a lista de artigos
    // vira só título, difícil de escanear numa categoria com muitos.
    resumo: { type: DataTypes.STRING(300), allowNull: true },
    conteudo: { type: DataTypes.TEXT, allowNull: false },
    // Ordem dentro da PRÓPRIA categoria (não global) — cada categoria
    // reordena a partir de 0, igual PatchNote.ordem faz pra "mais
    // recente primeiro" mas aqui é "ordem de leitura sugerida".
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    imagem_url: { type: DataTypes.STRING(500), allowNull: true },
    // Rascunho nunca aparece pro jogador (mesmo padrão de
    // PatchNote.status="Rascunho") — permite escrever/revisar sem
    // publicar antes da hora.
    publicado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "wiki_articles" },
);

module.exports = WikiArticle;
