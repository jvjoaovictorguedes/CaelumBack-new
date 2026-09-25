// Mapa Mundial (spec "Mapa de Caelum v1" §38/§39) — agrega dados de
// território/local com o estado real de Aventura/Expedição/Bestiário,
// SEM duplicar nenhuma regra de negócio dessas features: cada uma
// continua sendo a fonte de verdade (listarZonas/listarRegioes/
// calcularMaestriaDaRegiao já existentes), este service só junta tudo
// num único payload pro frontend montar o mapa (§51 — evitar dezenas
// de requests).
//
// Nomenclatura da resposta em snake_case, igual todo o resto da API
// deste projeto (nivel_minimo, desbloqueada, etc. — ver
// expeditionService/adventureService) — os exemplos de payload da
// spec usam camelCase (`polygon`, `controlEnabled`, ...), mas isso é
// só ilustrativo; manter consistência com a convenção real da API já
// em uso importa mais que copiar a casing literal do documento (mesma
// estrutura territories/nodes/connections/state, só a casing dos
// campos internos segue o padrão do projeto).
const Character = require("../models/Character");
const WorldTerritory = require("../models/WorldTerritory");
const WorldMapNode = require("../models/WorldMapNode");
const WorldMapConnection = require("../models/WorldMapConnection");
const { listarZonas, obterSessaoAtiva } = require("./adventureService");
const { listarRegioes: listarRegioesExpedicao } = require("./expeditionService");
const { listarRegioes: listarRegioesBestiario } = require("./bestiaryService");
const { Op } = require("sequelize");
const FishingZone = require("../models/FishingZone");
const FishingPort = require("../models/FishingPort");

// Chaves allowlisted pros serviços da Capital (spec §20/§50) — o
// cliente NUNCA decide/envia rota; só resolve pra cá a partir da
// chave guardada em WorldMapNode.metadata.services.
const SERVICE_ROUTES = {
  SHOP: "/dashboard/shop",
  MARKET: "/dashboard/market",
  FORGE: "/dashboard/forge",
  GUILDS: "/dashboard/guilds",
  QUESTS: "/dashboard/quests",
  PVP: "/dashboard/pvp",
};

function formatarTerritorio(territorio) {
  return {
    id: territorio.id,
    nome: territorio.nome,
    slug: territorio.slug,
    descricao: territorio.descricao,
    polygon: territorio.polygon_points,
    label: { x: territorio.label_x, y: territorio.label_y },
    // §16/§40/§50: nunca retornar owner/guild enquanto controle
    // territorial não existir — só o "ainda indisponível".
    controle_habilitado: territorio.controle_habilitado,
    estado: "neutro",
  };
}

function formatarNode(node, { zonaPorId, regiaoPorId, maestriaPorZonaId, fishingPorWorldNodeId }) {
  const pesca = fishingPorWorldNodeId.get(node.id) ?? null;
  const base = {
    id: node.id,
    nome: node.nome,
    tipo: node.tipo,
    id_territorio: node.id_territorio,
    x: node.x,
    y: node.y,
    icone_url: node.icone_url,
    imagem_url: node.imagem_url,
    // Ponto de Pesca (id_world_node de FishingZone/FishingPort) — spec
    // do pedido do usuário: "adicionar pontos de pesca no mapa
    // interativo, onde tem água obviamente". Independente do `tipo` do
    // Node (pode ser um Landmark/City que também é porto de pesca), por
    // isso é um campo à parte, não um novo valor de `tipo`.
    pesca,
  };

  if (node.tipo === "Adventure") {
    const zona = zonaPorId.get(node.entity_id);
    if (!zona) return { ...base, indisponivel: true };
    const maestria = maestriaPorZonaId.get(node.entity_id);
    return {
      ...base,
      adventure: {
        zona_id: zona.id,
        descricao: zona.descricao,
        nivel_recomendado: zona.nivel_recomendado,
        // Só informativo — nunca bloqueia entrada (spec §31).
        perigo: zona.perigo,
        bestiario: maestria ? { descobertos: maestria.descobertos, total: maestria.total } : null,
        maestria_nivel: maestria?.maestria_nivel ?? 0,
        maestria_numeral: maestria?.maestria_numeral ?? null,
      },
    };
  }

  if (node.tipo === "Expedition") {
    const regiao = regiaoPorId.get(node.entity_id);
    if (!regiao) return { ...base, indisponivel: true };
    return {
      ...base,
      expedition: {
        regiao_id: regiao.id,
        profissao: regiao.profissao,
        nivel_minimo: regiao.nivel_minimo,
        descricao: regiao.descricao,
        desbloqueada: regiao.desbloqueada,
        recursos: regiao.recursos,
      },
    };
  }

  if (node.tipo === "City") {
    const chavesServico = Array.isArray(node.metadata?.services) ? node.metadata.services : [];
    const servicos = chavesServico
      .filter((chave) => SERVICE_ROUTES[chave])
      .map((chave) => ({ chave, rota: SERVICE_ROUTES[chave] }));
    return { ...base, city: { servicos } };
  }

  return base;
}

async function obterMapaMundial(idPersonagem) {
  const personagem = await Character.findByPk(idPersonagem, { attributes: ["id", "nivel"] });
  const nivelPersonagem = personagem?.nivel ?? 1;

  // Cada fonte de verdade é consultada UMA vez só (nunca por node —
  // spec §39: "evitar N+1. Buscar/agrupar dados em lote").
  const [territorios, nodes, conexoes, zonasAventura, regioesExpedicao, bestiario, sessaoAtiva, zonasPesca, portosPesca] = await Promise.all([
    WorldTerritory.findAll({ where: { ativo: true }, order: [["ordem", "ASC"]] }),
    WorldMapNode.findAll({ where: { ativo: true }, order: [["ordem", "ASC"]] }),
    WorldMapConnection.findAll({ where: { ativo: true } }),
    listarZonas(nivelPersonagem),
    listarRegioesExpedicao(idPersonagem),
    listarRegioesBestiario(idPersonagem),
    obterSessaoAtiva(idPersonagem),
    // Zonas/portos de Pesca em lote — sem N+1 (mesma regra dos outros
    // domínios acima), filtrados só pelos que têm id_world_node setado.
    FishingZone.findAll({ where: { ativo: true, id_world_node: { [Op.ne]: null } }, attributes: ["id", "nome", "id_world_node"] }),
    FishingPort.findAll({ where: { ativo: true, id_world_node: { [Op.ne]: null } }, attributes: ["id", "nome", "id_world_node"] }),
  ]);

  const zonaPorId = new Map(zonasAventura.map((z) => [z.id, z]));
  const regiaoPorId = new Map(regioesExpedicao.map((r) => [r.id, r]));
  const maestriaPorZonaId = new Map(bestiario.regioes.map((r) => [r.id, r]));

  const fishingPorWorldNodeId = new Map();
  for (const zona of zonasPesca) {
    fishingPorWorldNodeId.set(zona.id_world_node, { tipo: "zona", id: zona.id, nome: zona.nome });
  }
  for (const porto of portosPesca) {
    // Um Node teoricamente pode ser porto E zona ao mesmo tempo — porto
    // "ganha" (é de onde a viagem começa), mas na prática hoje são
    // Nodes distintos.
    fishingPorWorldNodeId.set(porto.id_world_node, { tipo: "porto", id: porto.id, nome: porto.nome });
  }

  return {
    territories: territorios.map(formatarTerritorio),
    nodes: nodes.map((node) => formatarNode(node, { zonaPorId, regiaoPorId, maestriaPorZonaId, fishingPorWorldNodeId })),
    connections: conexoes.map((c) => ({ id: c.id, id_origem: c.id_origem, id_destino: c.id_destino, tipo: c.tipo })),
    state: {
      // Derivado de CharacterAdventureSession — spec §37: sem
      // localização física persistente, só atividade contextual.
      zona_aventura_ativa_id: sessaoAtiva?.id_area ?? null,
      zona_aventura_ativa_nome: sessaoAtiva?.area?.nome ?? null,
    },
  };
}

module.exports = { obterMapaMundial, SERVICE_ROUTES };
