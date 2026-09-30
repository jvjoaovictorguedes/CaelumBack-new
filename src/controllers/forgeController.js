// src/controllers/forgeController.js
//
// Forja v3 — fino de propósito (spec §51/§53): toda a matemática mora
// nos services (forgeSmeltingService/forgeCraftingService/
// forgeRefinementService/forgeService), aqui só valida entrada HTTP e
// formata resposta. O personagem SEMPRE vem de req.personagemAtual —
// nunca de um id no corpo/query (spec §53/§54).
const forgeService = require("../services/forgeService");
const forgeSmeltingService = require("../services/forgeSmeltingService");
const forgeCraftingService = require("../services/forgeCraftingService");
const forgeRefinementService = require("../services/forgeRefinementService");
const forgeRecipeService = require("../services/forgeRecipeService");
const forgeStatsService = require("../services/forgeStatsService");
const forgeToolService = require("../services/forgeToolService");
const forgeChancePreviewService = require("../services/forgeChancePreviewService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// GET /api/crafting/progress
exports.getProgresso = async (req, res) => {
  try {
    const progresso = await forgeService.listarProgresso(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { progresso } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar progresso da Forja.");
  }
};

// GET /api/crafting/smelting
exports.getSmelting = async (req, res) => {
  try {
    const opcoes = await forgeSmeltingService.listarOpcoes(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { opcoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar opções de Fundição.");
  }
};

// POST /api/crafting/smelt — body: { id_recurso, qualidade, quantidade_barras }
exports.postSmelt = async (req, res) => {
  try {
    const { id_recurso, qualidade, quantidade_barras } = req.body;
    const resultado = await forgeSmeltingService.fundir(req.personagemAtual.id, {
      id_recurso: Number(id_recurso),
      qualidade,
      quantidadeBarras: Number(quantidade_barras),
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao fundir barras.");
  }
};

// GET /api/crafting/blueprints?categoria=Arma — `categoria` opcional
// (Arma/Armadura/Acessorio1/Acessorio2): a tela de Fabricação carrega
// as seções FECHADAS por padrão e só pede os blueprints de uma
// categoria quando o jogador abre aquela seção, em vez de resolver
// ingrediente de todo o catálogo de uma vez (era o que deixava a busca
// lenta/às vezes travando — ver listarBlueprints).
exports.getBlueprints = async (req, res) => {
  try {
    const categoria = typeof req.query.categoria === "string" ? req.query.categoria : null;
    const blueprints = await forgeCraftingService.listarBlueprints(req.personagemAtual.id, categoria);
    res.status(200).json({ status: "success", data: { blueprints } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar blueprints.");
  }
};

// GET /api/crafting/blueprints/summary — contagem por categoria, sem
// resolver ingredientes (rápido) — usado pra desenhar os cabeçalhos de
// seção ainda FECHADOS antes do jogador pedir os dados completos.
exports.getBlueprintsSummary = async (req, res) => {
  try {
    const resumo = await forgeCraftingService.listarResumoPorCategoria(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { categorias: resumo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar resumo de blueprints.");
  }
};

// POST /api/crafting/craft — body: { id_blueprint, qualidade }
exports.postCraft = async (req, res) => {
  try {
    const { id_blueprint, qualidade } = req.body;
    const resultado = await forgeCraftingService.iniciarFabricacao(req.personagemAtual.id, {
      id_blueprint: Number(id_blueprint),
      qualidade,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao iniciar fabricação.");
  }
};

// GET /api/crafting/instances
exports.getInstances = async (req, res) => {
  try {
    const instancias = await forgeService.listarInstancias(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { instancias } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar equipamentos forjados.");
  }
};

// POST /api/crafting/instances/:id/equip
exports.postEquipInstance = async (req, res) => {
  try {
    const resultado = await forgeService.equiparInstancia(req.personagemAtual.id, Number(req.params.id));
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao equipar.");
  }
};

// GET /api/crafting/scrolls — catálogo de Pergaminhos de Melhoria (spec
// §7: quantidade e bônus visíveis, motivo quando o nível de Forja não
// alcança) já cruzado com o inventário/nível do personagem autenticado.
exports.getScrolls = async (req, res) => {
  try {
    const pergaminhos = await forgeRefinementService.listarPergaminhosDisponiveis(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { pergaminhos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar pergaminhos.");
  }
};

// GET /api/crafting/refine/preview?id_instancia=&id_item_pergaminho=
exports.getRefinePreview = async (req, res) => {
  try {
    const { id_instancia, id_item_pergaminho } = req.query;
    const previa = await forgeRefinementService.previaRefinamento(req.personagemAtual.id, {
      id_instancia: Number(id_instancia),
      id_item_pergaminho: id_item_pergaminho ? Number(id_item_pergaminho) : null,
    });
    res.status(200).json({ status: "success", data: previa });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao calcular prévia de refinamento.");
  }
};

// POST /api/crafting/refine — body: { id_instancia, id_item_pergaminho? }
exports.postRefine = async (req, res) => {
  try {
    const { id_instancia, id_item_pergaminho } = req.body;
    const resultado = await forgeRefinementService.iniciarRefinamento(req.personagemAtual.id, {
      id_instancia: Number(id_instancia),
      id_item_pergaminho: id_item_pergaminho ? Number(id_item_pergaminho) : null,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao iniciar refinamento.");
  }
};

// GET /api/crafting/forge-queue
exports.getForgeQueue = async (req, res) => {
  try {
    const fila = await forgeService.listarFila(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { fila } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar fila da Forja.");
  }
};

// POST /api/crafting/forge-collect — body: { slot: "Fundicao" | "Forja" }
exports.postForgeCollect = async (req, res) => {
  try {
    const { slot } = req.body;
    if (!["Fundicao", "Forja"].includes(slot)) {
      return res.status(400).json({ message: "Slot inválido." });
    }
    const resultado = await forgeService.coletar(req.personagemAtual.id, slot);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao coletar da Forja.");
  }
};

// Profissão de Ferreiro §12 — "recipe-book" em vez de "/recipes" porque
// esse path já é ocupado pela Forja v2 legada (craftingController.getReceitas,
// mantida intacta em /api/crafting/recipes por compatibilidade — ver
// craftingRoutes.js).

// GET /api/crafting/recipe-book — Livro de Receitas (spec §7.2/§7.3/§12).
exports.getRecipeBook = async (req, res) => {
  try {
    const livro = await forgeRecipeService.listarLivroReceitas(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: livro });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar Livro de Receitas.");
  }
};

// POST /api/crafting/recipe-book/:itemId/learn — aprender Receita física.
exports.postLearnRecipe = async (req, res) => {
  try {
    const resultado = await forgeRecipeService.aprenderReceita(req.personagemAtual.id, Number(req.params.itemId));
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao aprender Receita.");
  }
};

// GET /api/crafting/tools — Ferraria (spec §12).
exports.getTools = async (req, res) => {
  try {
    const ferramentas = await forgeToolService.listarFerramentas(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { ferramentas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar ferramentas de Ferraria.");
  }
};

// POST /api/crafting/tools/:instanceId/equip
exports.postEquipTool = async (req, res) => {
  try {
    const resultado = await forgeToolService.equiparFerramenta(req.personagemAtual.id, Number(req.params.instanceId));
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao equipar ferramenta.");
  }
};

// POST /api/crafting/tools/:slot/unequip
exports.postUnequipTool = async (req, res) => {
  try {
    await forgeToolService.desequiparFerramenta(req.personagemAtual.id, req.params.slot);
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desequipar ferramenta.");
  }
};

// GET /api/crafting/chance-preview?area=Fundicao|Fabricacao&qualidade=X
// (spec §12) — breakdown server-side de Fundição/Fabricação. Refinamento
// já tem breakdown próprio em GET /crafting/refine/preview (precisa de
// id_instancia).
exports.getChancePreview = async (req, res) => {
  try {
    const { area, qualidade } = req.query;
    if (area === "Fundicao") {
      const resultado = await forgeChancePreviewService.previewFundicao(req.personagemAtual.id);
      return res.status(200).json({ status: "success", data: resultado });
    }
    if (area === "Fabricacao") {
      const resultado = await forgeChancePreviewService.previewFabricacao(req.personagemAtual.id, qualidade);
      return res.status(200).json({ status: "success", data: resultado });
    }
    res.status(400).json({ message: "área inválida — use Fundicao ou Fabricacao (Refinamento usa /crafting/refine/preview)." });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao calcular prévia de chance.");
  }
};

// GET /api/crafting/blacksmith/stats — Habilidades de Ferreiro (spec §7.1).
exports.getBlacksmithStats = async (req, res) => {
  try {
    const [progresso, stats] = await Promise.all([
      forgeService.listarProgresso(req.personagemAtual.id),
      forgeStatsService.obterResumo(req.personagemAtual.id),
    ]);
    res.status(200).json({ status: "success", data: { progresso, stats } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar estatísticas de Ferreiro.");
  }
};
