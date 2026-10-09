function config(env = process.env) {
  const snowflake = (x) => /^\d{17,20}$/.test(x || "");
  const environment = ["production", "staging", "development"].includes(
    env.CAELUM_RELEASE_ENV,
  )
    ? env.CAELUM_RELEASE_ENV
    : "development";
  const idsReady = [
    env.DISCORD_APPLICATION_ID,
    env.DISCORD_GUILD_ID,
    env.DISCORD_NEWS_CHANNEL_ID,
  ].every(snowflake);
  const publicKeyReady = /^[a-f0-9]{64}$/i.test(env.DISCORD_PUBLIC_KEY || "");
  return {
    environment,
    enabled: env.DISCORD_NEWS_ENABLED === "true",
    applicationId: env.DISCORD_APPLICATION_ID,
    guildId: env.DISCORD_GUILD_ID,
    channelId: env.DISCORD_NEWS_CHANNEL_ID,
    token: env.DISCORD_BOT_TOKEN,
    publicKey: env.DISCORD_PUBLIC_KEY,
    ready: idsReady && publicKeyReady && !!env.DISCORD_BOT_TOKEN,
  };
}
module.exports = { config };
