import express from "express";
import upload from "../middleware/cloudinaryStorage.js";
import {
  createProperty,
  deleteProperty,
  getProperties,
  getPropertyById,
  updateProperty,
} from "../controllers/propertiesController.js";

const router = express.Router();

router.get("/all", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await getProperties(page, limit, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    const status = error?.message?.includes("must be") ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await getPropertyById(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, error: "Property not found" });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/create", async (req, res) => {
  try {
    const result = await createProperty(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put("/update/:id", async (req, res) => {
  try {
    const result = await updateProperty(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    await deleteProperty(req.params.id);
    res.json({ success: true, message: "Property deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/upload-property-images", upload.array("images", 10), (req, res) => {
  const images = (req.files || []).map((file) => ({
    url: file.path,
    public_id: file.filename,
  }));

  res.status(201).json({
    success: true,
    message: "Images uploaded successfully",
    images,
  });
});

export default router;
