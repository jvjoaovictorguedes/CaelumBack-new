// src/routes/classRoutes.js
const express = require("express");
const classController = require("../controllers/classController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, classController.createClass)
  .get(classController.getAllClasses);

router
  .route("/:id")
  .get(classController.getClassById)
  .patch(authMiddleware, adminMiddleware, classController.updateClass)
  .delete(authMiddleware, adminMiddleware, classController.deleteClass);

module.exports = router;
