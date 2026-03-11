import express from "express";
import { getProperties, getPropertyById } from "../controllers/globalController.js";

const router = express.Router();

router.get("/properties/all", async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filters = req.body || {};
        const { data, pagination } = await getProperties(page, limit, filters);
        res.json({ data, pagination });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/properties/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const property = await getPropertyById(id);
        if (!property) {
            return res.status(404).json({ error: "Property not found" });
        }
        res.json(property);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
