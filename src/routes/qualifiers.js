import express from "express";
import {
  createQualifier,
  getAllQualifiers,
  getQualifierById,
  updateQualifier,
  deleteQualifier
} from "../controllers/qualifierController.js";

const router = express.Router();

router.get("/", getAllQualifiers);
router.post("/", createQualifier);
router.get("/:id", getQualifierById);
router.put("/:id", updateQualifier);
router.delete("/:id", deleteQualifier);

export default router;
