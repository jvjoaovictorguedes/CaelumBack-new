export interface Ponto { x: number; y: number }
export interface Viewport extends Ponto { largura: number; altura: number }
export const ESCALA_MUNDO: Readonly<{ largura_tiles: 400; altura_tiles: 180; tile_px: 32; chunk_tiles: 32 }>;
export const VERSAO_PROTOCOLO: 1;
export const EVENTOS_MUNDO: Readonly<{ ENTRAR: "world:join"; SAIR: "world:leave"; MOVER: "world:move"; INTERAGIR: "world:interact"; CONJURAR: "world:cast"; SNAPSHOT: "world:snapshot"; ERRO: "world:error" }>;
export function percentualParaTile(x: number, y: number): Ponto;
export function tileParaPercentual(x: number, y: number): Ponto;
export function tileParaPixel(x: number, y: number): Ponto;
export function posicaoDentroDoMundo(x: number, y: number): boolean;
export function chunkDaPosicao(x: number, y: number): Ponto;
export function chunksVisiveis(viewport: Viewport, margem?: number): Ponto[];
export type TipoMira = "ALVO" | "LINHA" | "CONE" | "AREA_CHAO" | "SELF";
export interface IntencaoMover { sequencia: number; destino_tile: Ponto }
export interface IntencaoConjurar { sequencia: number; habilidade_id: number; alvo_id?: string; ponto_tile?: Ponto; direcao?: Ponto }
export interface IntencaoInteragir { sequencia: number; entidade_id: string }
export interface EntrarMundo { versao: 1; mapa_slug: string }
export interface EntidadeMundo { id: string; tipo: "jogador" | "monstro" | "npc" | "coleta"; tile: Ponto }
export interface SnapshotMundo { tick: number; reconhecida_sequencia: number; entidades: EntidadeMundo[]; removidas: string[] }
export interface ErroMundo { code: string; mensagem: string; sequencia?: number }
