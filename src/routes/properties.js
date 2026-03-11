import express from "express";
import { createProperty, deleteProperty, getProperties, updateProperty } from "../controllers/propertiesController.js"
import upload from "../middleware/cloudinaryStorage.js";

const router = express.Router();

router.get('/all', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filters = req.body || {};
        const result = await getProperties(page, limit, filters);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const result = await getPropertyById(req.params.id);
        if (result) {
            res.json(result);
        } else {
            res.status(404).json({ error: "Property not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/create', async (req, res) => {
    try {
        const result = await createProperty(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
})

router.put('/update/:id', async (req, res) => {
    try {
        const result = await updateProperty(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
})

router.delete('/delete/:id', async (req, res) => {
    try {
        await deleteProperty(req.params.id);
        res.json({ message: "Property deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
})

router.post("/upload-property-images", upload.array("images", 10), (req, res) => {

  const images = req.files.map(file => ({
    url: file.path,
    public_id: file.filename
  }));

  res.json({
    message: "Images uploaded successfully",
    images
  });

})

export default router;
