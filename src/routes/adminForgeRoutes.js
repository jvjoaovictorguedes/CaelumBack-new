// Painel Administrativo da Forja — montada sob /api/admin/forge.
// Conteúdo (blueprints/barras/pergaminhos) exige forge.manage;
// balanceamento global (fundição/fabricação/refinamento/progressão) e
// métricas exigem forge.balance — permissões SEPARADAS (§2.1).
const express = require("express");
const adminForgeController = require("../controllers/adminForgeController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

const podeGerenciarConteudo = requireAdminPermission("forge.manage");
const podeBalancear = requireAdminPermission("forge.balance");

// Blueprints
router.get("/blueprints", podeGerenciarConteudo, adminForgeController.listarBlueprints);
router.post("/blueprints", podeGerenciarConteudo, adminForgeController.criarBlueprint);
router.get("/blueprints/:id", podeGerenciarConteudo, adminForgeController.obterBlueprint);
router.put("/blueprints/:id", podeGerenciarConteudo, adminForgeController.atualizarBlueprint);
// Exclusão em massa (bug "exclua todos os blueprints, ativos ou
// inativos") — path sem :id, nunca colide com a exclusão individual
// abaixo.
router.delete("/blueprints", podeGerenciarConteudo, adminForgeController.excluirTodosBlueprints);
router.delete("/blueprints/:id", podeGerenciarConteudo, adminForgeController.excluirBlueprint);
router.post("/blueprints/:id/duplicate", podeGerenciarConteudo, adminForgeController.duplicarBlueprint);
router.post("/blueprints/:id/validate", podeGerenciarConteudo, adminForgeController.validarBlueprint);
router.post("/blueprints/:id/activate", podeGerenciarConteudo, adminForgeController.ativarBlueprint);
router.post("/blueprints/:id/deactivate", podeGerenciarConteudo, adminForgeController.desativarBlueprint);
router.get("/blueprints/:id/preview", podeGerenciarConteudo, adminForgeController.previewBlueprint);

// Barras
router.get("/bars", podeGerenciarConteudo, adminForgeController.listarBarras);
router.put("/bars/:resourceId/:quality", podeGerenciarConteudo, adminForgeController.upsertBarra);
router.delete("/bars/:resourceId/:quality", podeGerenciarConteudo, adminForgeController.removerBarra);

// Pergaminhos
router.get("/scrolls", podeGerenciarConteudo, adminForgeController.listarScrolls);
router.post("/scrolls", podeGerenciarConteudo, adminForgeController.criarScroll);
router.put("/scrolls/:itemId", podeGerenciarConteudo, adminForgeController.atualizarScroll);
router.post("/scrolls/:itemId/duplicate", podeGerenciarConteudo, adminForgeController.duplicarScroll);
router.post("/scrolls/:itemId/deactivate", podeGerenciarConteudo, adminForgeController.desativarScroll);
router.post("/scrolls/:itemId/reactivate", podeGerenciarConteudo, adminForgeController.reativarScroll);

// Recursos (seletor de ingrediente lógico) — qualquer uma das duas
// permissões da Forja já basta pra só LER a lista de recursos.
router.get("/resources", podeGerenciarConteudo, adminForgeController.listarRecursos);

// Balanceamento / métricas
router.get("/balance", podeBalancear, adminForgeController.obterBalanceamento);
router.put("/balance/:group", podeBalancear, adminForgeController.atualizarBalanceamento);
router.post("/balance/preview-refinement", podeBalancear, adminForgeController.previewRefinamento);
router.post("/balance/preview-progression-impact", podeBalancear, adminForgeController.previewImpactoProgressao);
router.get("/metrics", podeBalancear, adminForgeController.obterMetricas);

module.exports = router;
