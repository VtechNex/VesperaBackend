import express from "express";
import { login, register } from "../controllers/authController.js";
import { authMiddleware, requirePermission } from "../middleware/security.js";
import { changePassword, getAssignableUsers, getCurrentUser, updateCurrentUser } from "../controllers/settingsController.js";

const router = express.Router();

router.post("/log", login);
router.post("/reg", register);
router.get("/me", authMiddleware, getCurrentUser);
router.get("/assignable-users", authMiddleware, requirePermission("canCreateLead"), getAssignableUsers);
router.put("/me", authMiddleware, updateCurrentUser);
router.put("/change-password", authMiddleware, changePassword);

export default router;
