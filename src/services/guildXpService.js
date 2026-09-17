// Progressão de nível da guilda, lendo a tabela configurável
// GuildLevelConfig (em vez de fórmula fixa no código, como pede o
// documento de design) — permite subir vários níveis de uma vez se o XP
// concedido for grande o suficiente.
const GuildLevelConfig = require("../models/GuildLevelConfig");

async function concederExperiencia(guild, quantidade) {
  if (quantidade <= 0) return { subiuNivel: false, niveisGanhos: 0 };

  guild.experiencia += quantidade;
  let niveisGanhos = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const configAtual = await GuildLevelConfig.findByPk(guild.nivel);
    const xpNecessario = configAtual?.xp_para_proximo_nivel;
    if (!xpNecessario || guild.experiencia < xpNecessario) break;

    guild.experiencia -= xpNecessario;
    guild.nivel += 1;
    niveisGanhos += 1;

    const proximaConfig = await GuildLevelConfig.findByPk(guild.nivel);
    if (proximaConfig) {
      guild.limite_membros = proximaConfig.limite_membros;
    } else {
      // Nível máximo da tabela — trava o XP no teto pra não acumular
      // infinito além do que a config prevê.
      guild.experiencia = 0;
      break;
    }
  }

  return { subiuNivel: niveisGanhos > 0, niveisGanhos };
}

module.exports = { concederExperiencia };
