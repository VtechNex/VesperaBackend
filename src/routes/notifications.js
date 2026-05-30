import express from "express";
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  unreadNotificationCount,
} from "../controllers/notificationsController.js";

const router = express.Router();

router.get("/", listNotifications);
router.get("/unread-count", unreadNotificationCount);
router.patch("/read-all", markAllNotificationsAsRead);
router.patch("/:id/read", markNotificationAsRead);

export default router;
