const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../middleware/errorHandler");
const {
  getNotifications,
  markAllAsRead,
} = require("../controllers/notification");

// GET Notifications
router.get(
  "/notifications",
  asyncHandler(getNotifications)
);

// PATCH Notifications (Front-end path support)
router.patch(
  "/notifications",
  asyncHandler(markAllAsRead)
);

// Existing route support
router.patch(
  "/notifications/read-all",
  asyncHandler(markAllAsRead)
);

module.exports = router;