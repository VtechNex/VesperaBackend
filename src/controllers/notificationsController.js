import {
  clearAllNotifications,
  deleteNotification,
  getNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService.js";

export async function listNotifications(req, res) {
  try {
    const payload = await getNotificationsForUser(req.user, req.query);
    return res.json({
      success: true,
      data: payload.data,
      pagination: payload.pagination,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
}

export async function unreadNotificationCount(req, res) {
  try {
    const unreadCount = await getUnreadNotificationCount(req.user.id);
    return res.json({
      success: true,
      data: {
        unreadCount,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch unread count" });
  }
}

export async function markNotificationAsRead(req, res) {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.json({
      success: true,
      data: {
        id: notification.id,
        isRead: notification.is_read,
        readAt: notification.read_at,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to update notification" });
  }
}

export async function markAllNotificationsAsRead(req, res) {
  try {
    const updatedCount = await markAllNotificationsRead(req.user.id);
    return res.json({
      success: true,
      data: {
        updatedCount,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to update notifications" });
  }
}

export async function deleteNotificationById(req, res) {
  try {
    const deleted = await deleteNotification(req.params.id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.json({
      success: true,
      data: {
        id: deleted.id,
        wasUnread: !deleted.is_read,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to delete notification" });
  }
}

export async function clearAllNotificationsForCurrentUser(req, res) {
  try {
    const deletedRows = await clearAllNotifications(req.user.id);
    return res.json({
      success: true,
      data: {
        deletedCount: deletedRows.length,
        deletedUnreadCount: deletedRows.filter((row) => row.is_read === false).length,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to clear notifications" });
  }
}
