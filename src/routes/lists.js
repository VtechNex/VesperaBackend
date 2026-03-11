import express from "express";
import {
  createList,
  getAllLists,
  getListById,
  updateList,
  deleteList,
  getListsWithLeadsCount
} from "../controllers/listController.js";

const router = express.Router();

router.post("/", createList);
router.get("/", getAllLists);
router.get("/with-counts", getListsWithLeadsCount);
router.get("/:id", getListById);
router.put("/:id", updateList);
router.delete("/:id", deleteList);

export default router;
