import express from "express";
import { login, register } from "../controllers/authController.js";
import { authMiddleware } from "../middleware/security.js";
import { changePassword, getCurrentUser, updateCurrentUser } from "../controllers/settingsController.js";

const router = express.Router();

router.post("/log", login);
router.post("/reg", register);
router.get("/me", authMiddleware, getCurrentUser);
router.put("/me", authMiddleware, updateCurrentUser);
router.put("/change-password", authMiddleware, changePassword);

export default router;
