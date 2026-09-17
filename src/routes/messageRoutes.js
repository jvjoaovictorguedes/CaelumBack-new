const express = require("express");
const messageController = require("../controllers/messageController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, messageController.sendMessage);
router.get("/unread-count/:userId", authMiddleware, messageController.getUnreadCount);
router.get("/inbox/:userId", authMiddleware, messageController.getInbox);
router.get(
  "/conversation/:userId/:otherUserId",
  authMiddleware,
  messageController.getConversation,
);

module.exports = router;
