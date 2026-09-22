// Infra dos testes de integração do PvP v2.
//
// Os testes de banco precisam de um Postgres de verdade apontado por
// TEST_DATABASE_URL (ou DATABASE_URL). Sem isso, os arquivos que usam
// este helper se marcam como skip em vez de falhar — assim `npm test`
// continua rodando a bateria pura (tier, deltas, soft reset, IA,
// chaveamento) em qualquer máquina.
process.env.NODE_ENV = process.env.NODE_ENV || "test";
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const { sequelize } = require("../../src/config/database");

let disponivel = null;

async function bancoDisponivel() {
  if (disponivel !== null) return disponivel;
  try {
    await sequelize.authenticate();
    disponivel = true;
  } catch {
    disponivel = false;
  }
  return disponivel;
}

let contador = 0;
function sufixo() {
  contador += 1;
  return `${process.pid}_${Date.now()}_${contador}`;
}

const User = require("../../src/models/User");
const Race = require("../../src/models/Race");
const Class = require("../../src/models/Class");
const Character = require("../../src/models/Character");
require("../../src/models/associations");
// Character <-> Race/Class são registradas inline no characterController
// (padrão histórico do projeto). Carregar o controller aqui garante que
// qualquer include usado pelos services de PvP funcione nos testes, sem
// precisar subir o app inteiro.
require("../../src/controllers/characterController");
require("../../src/controllers/characterAbilitiesController");

let racaPadrao = null;
let classePadrao = null;

async function garantirCatalogo() {
  if (!racaPadrao) {
    racaPadrao = await Race.create({ nome_masculino: `Raça ${sufixo()}`, nome_feminino: `Raça ${sufixo()}` });
  }
  if (!classePadrao) {
    classePadrao = await Class.create({ nome: `Classe ${sufixo()}` });
  }
  return { raca: racaPadrao, classe: classePadrao };
}

// Personagem mínimo e descartável, só com o que os testes de PvP
// precisam (nível e identidade). Atributos ficam num valor baixo e
// igual pra ninguém ter vantagem por acaso.
async function criarPersonagem({ nivel = 10, isAdmin = false } = {}) {
  const { raca, classe } = await garantirCatalogo();
  const chave = sufixo();
  const usuario = await User.create({
    username: `user_${chave}`,
    email: `user_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    ...(isAdmin ? { isAdmin: true } : {}),
  });
  const personagem = await Character.create({
    id_usuario: usuario.id,
    nome: `Personagem ${chave}`,
    genero: "Masculino",
    nivel,
    vida_atual: 100,
    mana_atual: 50,
    forca: 10,
    vitalidade: 10,
    agilidade: 10,
    inteligencia: 10,
    velocidade: 10,
    natureza_magica: "Fogo",
    id_raca: raca.id,
    id_classe: classe.id,
  });
  return { usuario, personagem };
}

module.exports = { sequelize, bancoDisponivel, criarPersonagem, sufixo };
