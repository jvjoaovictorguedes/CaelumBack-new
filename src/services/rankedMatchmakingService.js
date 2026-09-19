// Fila da Arena Ranqueada (§3/§4) — em memória, com persistência
// mínima (a partida em si vira um RankedMatch quando pareada). Mantida
// deliberadamente sem qualquer import de socket.io: quem consome os
// eventos "match" é a camada de integração com o Live Duel
// (rankedLiveSocket.js). Isso deixa migrar pra uma fila real (Redis,
// múltiplas instâncias) uma troca de implementação aqui dentro, sem
// mexer no resto do sistema (§4).
const EventEmitter = require("node:events");
const { FAIXAS_MATCHMAKING } = require("../config/rankedConfig");

const INTERVALO_TICK_MS = 1000;

class RankedMatchmakingService extends EventEmitter {
  constructor() {
    super();
    this.fila = new Map(); // characterId -> { characterId, rating, entrouEm }
    this._timer = null;
    // Predicado síncrono opcional injetado de fora (anti-farm §10: limitar
    // rematch consecutivo do mesmo par) — por padrão sempre permite.
    this.podeParear = () => true;
  }

  faixaParaTempo(tempoNaFilaMs) {
    const entrada = FAIXAS_MATCHMAKING.find((f) => tempoNaFilaMs <= f.ateMs);
    return entrada ? entrada.faixa : FAIXAS_MATCHMAKING[FAIXAS_MATCHMAKING.length - 1].faixa;
  }

  estaNaFila(characterId) {
    return this.fila.has(characterId);
  }

  entrar(characterId, rating) {
    if (this.fila.has(characterId)) return false;
    this.fila.set(characterId, { characterId, rating, entrouEm: Date.now() });
    this._garantirTick();
    return true;
  }

  sair(characterId) {
    const existia = this.fila.delete(characterId);
    this._pararTickSeVazio();
    return existia;
  }

  tamanhoFila() {
    return this.fila.size;
  }

  tempoNaFilaMs(characterId) {
    const entrada = this.fila.get(characterId);
    if (!entrada) return null;
    return Date.now() - entrada.entrouEm;
  }

  _garantirTick() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), INTERVALO_TICK_MS);
    if (this._timer.unref) this._timer.unref();
  }

  _pararTickSeVazio() {
    if (this.fila.size === 0 && this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // Varre a fila em ordem de chegada e forma pares cujo diff de rating
  // caiba na faixa ATUAL de ambos (a faixa amplia com o tempo — §4).
  // Nunca pareia um jogador consigo mesmo (Map por characterId já
  // impede duplicata).
  _tick() {
    const agora = Date.now();
    const candidatos = [...this.fila.values()].sort((a, b) => a.entrouEm - b.entrouEm);
    const pareados = new Set();

    for (let i = 0; i < candidatos.length; i += 1) {
      const a = candidatos[i];
      if (pareados.has(a.characterId)) continue;
      const faixaA = this.faixaParaTempo(agora - a.entrouEm);

      for (let j = i + 1; j < candidatos.length; j += 1) {
        const b = candidatos[j];
        if (pareados.has(b.characterId)) continue;
        const faixaB = this.faixaParaTempo(agora - b.entrouEm);
        const diff = Math.abs(a.rating - b.rating);
        if (diff > faixaA || diff > faixaB) continue;
        if (!this.podeParear(a.characterId, b.characterId, candidatos.length)) continue;

        pareados.add(a.characterId);
        pareados.add(b.characterId);
        this.fila.delete(a.characterId);
        this.fila.delete(b.characterId);
        this.emit("match", { jogador1: a.characterId, jogador2: b.characterId });
        break;
      }
    }

    this._pararTickSeVazio();
  }
}

module.exports = new RankedMatchmakingService();
