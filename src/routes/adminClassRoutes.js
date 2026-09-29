// Painel Administrativo — Classes V2 Fase 2. Montada sob /api/admin/classes.
const express = require("express");
const adminClassController = require("../controllers/adminClassController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("classes.manage"));

// Validador/simulador/catálogo de efeitos precisam vir antes de
// "/:id" — senão o Express casa "validator"/"simulator"/"effects" com
// o parâmetro de id da classe.
router.get("/validator", adminClassController.validarIntegridade);
router.post("/simulator", adminClassController.simularEvolucao);
router.get("/effects/catalog", adminClassController.catalogoEfeitos);

router.get("/", adminClassController.listarClasses);
router.get("/:id", adminClassController.buscarClasse);
router.patch("/:id", adminClassController.atualizarClasse);

router.post("/:idClasse/evolution-paths", adminClassController.criarCaminho);
router.patch("/evolution-paths/:id", adminClassController.atualizarCaminho);
router.delete("/evolution-paths/:id", adminClassController.excluirCaminho);

router.post("/evolution-paths/:idEvolucao/requirements", adminClassController.criarRequisito);
router.patch("/requirements/:id", adminClassController.atualizarRequisito);
router.delete("/requirements/:id", adminClassController.excluirRequisito);

router.post("/evolution-paths/:idEvolucao/abilities", adminClassController.criarHabilidade);
router.patch("/abilities/:id", adminClassController.atualizarHabilidade);
router.delete("/abilities/:id", adminClassController.excluirHabilidade);

router.post("/evolution-paths/:idEvolucao/effects", adminClassController.criarEfeito);
router.patch("/effects/:id", adminClassController.atualizarEfeito);
router.delete("/effects/:id", adminClassController.excluirEfeito);

module.exports = router;
