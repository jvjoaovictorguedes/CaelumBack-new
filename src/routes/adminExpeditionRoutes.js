// Painel Administrativo de Expedição — montada sob /api/admin/expedition.
// Uma tela só que cobre o balanceamento de Expedição (tempo/drops/
// progressão + a Emboscada que mora dentro dela), Aventura (perigo) e
// Aventura em Grupo (escala/limites), pedido explícito do jogador de
// juntar essas 3 telas de balanceamento num painel só.
const express = require("express");
const adminExpeditionController = require("../controllers/adminExpeditionController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

const podeBalancear = requireAdminPermission("expedition.balance");

router.get("/balance", podeBalancear, adminExpeditionController.obterBalanceamento);
router.put("/balance/:group", podeBalancear, adminExpeditionController.atualizarBalanceamento);

// Quais recursos caem (ativo) e o peso relativo de cada um por região,
// pras 3 profissões — pedido do jogador: "poder escolher que tipos de
// drops caem na exploração" (vale igual pra Mineração/Silvicultura).
router.get("/resources", podeBalancear, adminExpeditionController.listarRecursos);
router.post("/resources", podeBalancear, adminExpeditionController.criarRecurso);
router.patch("/resources/:idRecurso/active", podeBalancear, adminExpeditionController.atualizarAtivoDoRecurso);
router.patch(
  "/resources/region/:idRegiao/:idRecurso/weight",
  podeBalancear,
  adminExpeditionController.atualizarPesoNaRegiao,
);

router.get('/recipes',podeBalancear,async(req,res,next)=>{try{res.json({data:await require('../services/expeditionRecipeFindService').catalog()});}catch(e){next(e);}});
router.put('/recipes',podeBalancear,async(req,res,next)=>{try{res.json({data:await require('../services/expeditionRecipeFindService').save(req.body,{idAdmin:req.user.id,req})});}catch(e){if(e.statusCode)return res.status(e.statusCode).json({message:e.message});next(e);}});
module.exports = router;
