import express from "express";
import {
  createUser,
  updateUser,
  deleteUser,
  getUserById,
  getAllUsers,
  deactiveUser
} from "../controllers/admin.user.controller.js";

const router = express.Router();

router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.put("/users/deactive/:id", deactiveUser);
router.get("/users/:id", getUserById);
router.get("/users", getAllUsers);

export default router;
