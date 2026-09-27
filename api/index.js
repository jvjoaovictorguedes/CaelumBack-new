// Entry point da função serverless da Vercel — ela procura um handler
// (req, res) em api/*.js. src/app.js exporta o Express `app`, que já É
// esse handler (Express apps são chamáveis como (req, res) => void).
module.exports = require("../src/app");
