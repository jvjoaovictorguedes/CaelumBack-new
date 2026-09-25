const express = require("express");
const adminGuildJournalController = require("../controllers/adminGuildJournalController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("guildjournal.manage"));

router.get("/", adminGuildJournalController.listar);
router.post("/", adminGuildJournalController.criar);
router.patch("/:id", adminGuildJournalController.atualizar);

module.exports = router;
