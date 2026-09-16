const express = require("express");
const messageController = require("../controllers/messageController");

const router = express.Router();

router.post("/", messageController.sendMessage);
router.get("/unread-count/:userId", messageController.getUnreadCount);
router.get("/inbox/:userId", messageController.getInbox);
router.get("/conversation/:userId/:otherUserId", messageController.getConversation);

module.exports = router;
