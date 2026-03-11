import express from "express";
import {
  createLead,
  getLeadsByListId,
  getAllLeads,
  getLeadById,
  updateLead,
  deleteLead,
  searchLeads
} from "../controllers/leadController.js";

const router = express.Router();

router.post("/", createLead);
router.post("/search", searchLeads);
router.get("/", getAllLeads);
router.get("/list/:list_id", getLeadsByListId);
router.get("/:id", getLeadById);
router.put("/:id", updateLead);
router.delete("/:id", deleteLead);

export default router;
