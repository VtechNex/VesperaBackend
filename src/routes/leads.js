import express from "express";
import {
  createLead,
  getLeadsByListId,
  getAllLeads,
  getLeadById,
  updateLead,
  deleteLead,
  searchLeads,
  triggerFollowUps
} from "../controllers/leadController.js";

const router = express.Router();

router.post("/", createLead);
router.post("/search", searchLeads);
router.get("/", getAllLeads);
router.get("/list/:list_id", getLeadsByListId);
router.get("/:id", getLeadById);
router.put("/:id", updateLead);
router.delete("/:id", deleteLead);

// Manual trigger for follow-up email processing (admin/owner can hit this to run immediately)
router.post("/followups/trigger", triggerFollowUps);

export default router;
