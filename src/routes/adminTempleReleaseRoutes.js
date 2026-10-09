const router = require('express').Router();
const {sequelize} = require('../config/database');
const GameSetting = require('../models/GameSetting');
const release = require('../services/templeReleaseService');
const {registrarAcao} = require('../services/adminAuditService');
router.use(require('../middlewares/authMiddleware'), require('../middlewares/adminMiddleware'), require('../middlewares/requireAdminPermission')('temple.manage'));
router.get('/', async(req,res,next)=>{try{res.json({data:{enabled:await release.enabled()}});}catch(e){next(e);}});
router.patch('/', async(req,res,next)=>{try{
 if(typeof req.body?.enabled !== 'boolean') return res.status(400).json({message:'enabled deve ser booleano.'});
 await sequelize.transaction(async transaction=>{
  const before=await GameSetting.findByPk(release.KEY,{transaction,lock:transaction.LOCK.UPDATE});
  const valor=req.body.enabled;
  await GameSetting.upsert({chave:release.KEY,valor,tipo:'json',editavel_admin:true,updated_by_admin_id:req.user.id},{transaction});
  await registrarAcao({idAdmin:req.user.id,acao:'UPDATE_TEMPLE_RELEASE',entidade:'GameSetting',dadosAntes:before?.toJSON()||null,dadosDepois:{chave:release.KEY,valor},req,transaction});
 });
 await require('../services/gameSettingCache').recarregar();
 res.json({data:{enabled:await release.enabled()}});
}catch(e){next(e);}});
module.exports=router;
