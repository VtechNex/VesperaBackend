import express from "express";
import upload from "../middleware/cloudinaryStorage.js";
import { authMiddleware, requirePermission } from "../middleware/security.js";
import {
  createCustomField,
  deleteCustomField,
  getCompanyProfile,
  getCustomFields,
  updateCustomField,
  upsertCompanyProfile,
} from "../controllers/settingsController.js";

const router = express.Router();

router.get("/company-profile", authMiddleware, requirePermission("canManageCompanyProfile"), getCompanyProfile);
router.put("/company-profile", authMiddleware, requirePermission("canManageCompanyProfile"), upsertCompanyProfile);
router.get("/custom-fields", authMiddleware, requirePermission("canManageLeadStages"), getCustomFields);
router.post("/custom-fields", authMiddleware, requirePermission("canManageLeadStages"), createCustomField);
router.put("/custom-fields/:id", authMiddleware, requirePermission("canManageLeadStages"), updateCustomField);
router.delete("/custom-fields/:id", authMiddleware, requirePermission("canManageLeadStages"), deleteCustomField);
router.post("/branding/upload", authMiddleware, requirePermission("canManageCompanyProfile"), upload.single("file"), (req, res) => {
  if (!req.file?.path) {
    return res.status(400).json({ success: false, message: "Upload failed" });
  }

  return res.status(201).json({
    success: true,
    data: {
      url: req.file.path,
      publicId: req.file.filename,
    },
  });
});

export default router;
