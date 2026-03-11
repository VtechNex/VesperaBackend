import express from "express";
import { login, register } from "../controllers/authController.js";

const router = express.Router();

// Login
router.post("/log", login);

router.post("/reg", register);

export default router;
