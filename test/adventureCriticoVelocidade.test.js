// Sistema de Precisão + Crítico (Velocidade) — integração de verdade,
// via combatController (mesmo endpoint que a Aventura solo usa),
// diferente de test/combatPrecisaoCritico.test.js (que só testa as
// fórmulas puras em combatFormulas.js sem banco nenhum). Mesmo padrão de
// fixture isolada de test/adventureMonsterDefesaEncontro.test.js (zona/
// monstro/vínculo próprios, nunca os dados compartilhados de
// aventuraExpansao.test.js).
//
// RNG real (rolarCritico usa Math.random) — não dá pra travar o
// resultado exato de UM ataque, então o teste é ESTATÍSTICO: repete o
// mesmo ataque várias vezes (resetando o encontro a cada tentativa,
// mesmo truque de test/combatEvolucaoStatusIntegracao.test.js) com a
// Velocidade do personagem no teto de chance de crítico (~40%,
// CHANCE_CRITICO_MAXIMA) e confere que uma fração saudável das
// tentativas saiu crítica — nunca checa "toda vez" (isso seria
// determinismo que a fórmula não promete), só "acontece de verdade, com
// frequência plausível" e "acompanhado da flag/log certos".
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo } = require("./helpers/db");
require("../src/models/associations");

const Character = require("../src/models/Character");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const adventureService = require("../src/services/adventureService");
const combatController = require("../src/controllers/combatController");
const { probabilidadeDeCritico } = require("../src/services/combatFormulas");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

function reqRes(characterId, body) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  return { req, res, resultado: () => ({ statusCode, corpo }) };
}

async function chamarExecutarTurno(characterId, action) {
  const { req, res, resultado } = reqRes(characterId, { action });
  await combatController.executarTurno(req, res);
  return resultado();
}

// Monstro com HP gigante (nunca morre durante o teste, então a resposta
// sempre cai no turno "normal", nunca no fluxo de vitória) e dano MÍNIMO
// (1..1, explícito — nunca null, pra não bater no bug conhecido e não
// relacionado de dano_min/dano_max ausentes virando NaN em
// combatController.js) — só precisamos que o jogador ataque repetidas
// vezes sem morrer nem vencer no meio do caminho.
async function criarZonaComMonstroTanque() {
  const zona = await AdventureZone.create({
    nome: `Zona Crítico Teste ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 99,
    ativa: true,
  });
  const monstro = await AdventureMonster.create({
    nome: `Alvo de Treino Crítico ${sufixo()}`,
    nivel: 1,
    vida_maxima: 1_000_000,
    dano_min: 1,
    dano_max: 1,
    agilidade: 1,
    velocidade: 1, // baixa de propósito — Precisão do personagem não precisa "vencer" nada aqui
    xp_recompensa: 1,
    ouro_recompensa: 1,
    defesa: 0,
    ativo: true,
  });
  await AdventureZoneMonster.create({
    id_area: zona.id,
    id_monstro: monstro.id,
    peso_aparicao: 100,
    tipo_aparicao: "Comum",
    nivel_jogador_minimo: 1,
    ativo: true,
  });
  return { zona, monstro };
}

testeComBanco(
  "Aventura solo: Velocidade alta do personagem produz ACERTO CRÍTICO de verdade (dano ampliado + flag + log), com frequência plausível",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 5 });
    // Velocidade bem acima do teto de chance de crítico (CHANCE_CRITICO_MAXIMA
    // = 40%, ver combatFormulas.probabilidadeDeCritico) — qualquer valor daqui
    // pra cima trava na mesma chance, então usar um valor alto e redondo deixa
    // o teste estável sem precisar recalcular a fórmula aqui.
    personagem.velocidade = 500;
    personagem.forca = 30; // ataque básico com dano sólido, pra distinguir crítico de variação normal
    await personagem.save();

    const { zona } = await criarZonaComMonstroTanque();
    await adventureService.entrarNaZona(personagem.id, zona.id);

    const gerar = reqRes(personagem.id, {});
    await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);
    assert.equal(gerar.resultado().statusCode, 200, JSON.stringify(gerar.resultado().corpo));
    const inimigoBase = gerar.resultado().corpo.data.enemy;

    const chanceTeorica = probabilidadeDeCritico({ velocidade: personagem.velocidade });
    assert.ok(chanceTeorica > 0.3, `fixture precisa deixar a chance de crítico perto do teto (obtido ${chanceTeorica})`);

    const TENTATIVAS = 200;
    let contagemCritico = 0;
    let contagemHitsNaoCriticos = 0;
    let danoMaximoNaoCritico = 0;
    let danoMinimoCritico = Infinity;

    for (let i = 0; i < TENTATIVAS; i++) {
      // UPDATE estático (Character.update), nunca reaproveitando a MESMA
      // instância Sequelize `personagem` pra mutar+save em loop: essa
      // instância guarda o valor que ELA MESMA escreveu da última vez
      // (_previousDataValues) e, como repetimos o MESMO vida_atual=1000
      // toda volta, o dirty-check (isEqual) via instância às vezes
      // elidia a coluna inteira do UPDATE — a coluna real no banco
      // (mutada por executarTurno, que sempre carrega sua PRÓPRIA cópia
      // fresca via findByPk) continuava caindo turno a turno sem nunca
      // ser resetada de verdade, até "derrotar" o personagem no meio do
      // loop (bug do FIXTURE do teste, não do motor de combate — achado
      // e corrigido durante a escrita deste teste).
      // eslint-disable-next-line no-await-in-loop
      await Character.update(
        {
          encontro_pve: {
            ...inimigoBase,
            vida_maxima: 1_000_000,
            vida_atual: 1_000_000,
            statusEffects: { player: [], enemy: [] },
            cooldowns: { player: {}, enemy: {} },
            combatTurn: 0,
          },
          vida_atual: 1000,
          mana_atual: 100,
        },
        { where: { id: personagem.id } },
      );

      // eslint-disable-next-line no-await-in-loop
      const r = await chamarExecutarTurno(personagem.id, { type: "attack" });
      assert.equal(r.statusCode, 200, JSON.stringify(r.corpo));

      const foiEsquiva = r.corpo.data.log.some((l) => l.includes("esquivou"));
      if (foiEsquiva) continue; // ~5% de piso de esquiva do monstro — descartado da amostra, não é o que testamos aqui

      const danoCausado = 1_000_000 - r.corpo.data.enemy.vida_atual;

      // Só a linha do PRÓPRIO ataque do jogador — o contra-ataque do
      // monstro (linha separada, "${nome} atacou e causou...") também
      // pode sair crítico (criticoInimigo) e conter o mesmo texto, então
      // checar "ACERTO CRÍTICO" solto no log inteiro misturaria os dois.
      const linhaDoAtaqueDoJogador = r.corpo.data.log.find((l) => l.startsWith("Você atacou"));
      assert.ok(linhaDoAtaqueDoJogador, "esperava uma linha de log pro ataque básico do jogador");

      if (r.corpo.data.criticoJogador) {
        contagemCritico += 1;
        danoMinimoCritico = Math.min(danoMinimoCritico, danoCausado);
        assert.ok(
          linhaDoAtaqueDoJogador.includes("ACERTO CRÍTICO"),
          "log do ataque do jogador precisa anunciar ACERTO CRÍTICO quando data.criticoJogador vier true",
        );
      } else {
        contagemHitsNaoCriticos += 1;
        danoMaximoNaoCritico = Math.max(danoMaximoNaoCritico, danoCausado);
        assert.ok(
          !linhaDoAtaqueDoJogador.includes("ACERTO CRÍTICO"),
          "log do ataque do jogador não pode anunciar crítico quando data.criticoJogador vier false",
        );
      }
    }

    assert.ok(
      contagemCritico > TENTATIVAS * 0.15,
      `esperava uma fração saudável de críticos (~40% teórico) em ${TENTATIVAS} tentativas — obtido ${contagemCritico}`,
    );
    assert.ok(contagemHitsNaoCriticos > 0, "esperava ver ao menos um golpe não-crítico pra comparar");
    // Prova de que o crítico realmente AMPLIA o dano bruto (não é só uma
    // flag de UI solta): o pior golpe crítico observado precisa superar o
    // melhor golpe normal observado — MULTIPLICADOR_DANO_CRITICO=1.5x é
    // grande o bastante pra nunca empatar com a variação normal (±15%)
    // do dano básico.
    assert.ok(
      danoMinimoCritico > danoMaximoNaoCritico,
      `dano crítico mínimo (${danoMinimoCritico}) devia superar o dano não-crítico máximo (${danoMaximoNaoCritico})`,
    );
  },
);
