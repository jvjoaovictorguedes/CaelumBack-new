const { config } = require("./config");
async function request(path, { method = "GET", body, transport = fetch } = {}) {
  const c = config();
  let response;
  try {
    response = await transport(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${c.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Object.assign(new Error("Resposta do Discord não confirmada."), {
      ambiguous: method === "POST",
    });
  }
  let data;
  try {
    data = await response.json();
  } catch {
    if (response.ok && method !== "GET")
      throw Object.assign(new Error("Resposta do Discord não confirmada."), {
        ambiguous: method === "POST",
      });
    data = {};
  }
  if (!response.ok)
    throw Object.assign(new Error(`Discord HTTP ${response.status}`), {
      status: response.status,
      retryAfter: Number(data.retry_after) || 30,
      ambiguous: method === "POST" && response.status >= 500,
    });
  return data;
}
function sendMessage(channelId, payload, nonce, transport) {
  return request(`/channels/${channelId}/messages`, {
    method: "POST",
    body: { ...payload, nonce, enforce_nonce: true },
    transport,
  });
}
function getMessage(channelId, messageId) {
  if (
    !/^\d{17,20}$/.test(channelId || "") ||
    !/^\d{17,20}$/.test(messageId || "")
  )
    throw new Error("IDs inválidos.");
  return request(`/channels/${channelId}/messages/${messageId}`);
}
async function verifyDestination() {
  const c = config();
  const channel = await request(`/channels/${c.channelId}`);
  return channel.guild_id === c.guildId && [0, 5].includes(channel.type);
}
module.exports = { request, sendMessage, getMessage, verifyDestination };
