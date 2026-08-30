const express = require("express");

const router = express.Router();

const { asyncHandler } = require("../middleware/errorHandler");

const {
  getNotifications,
  markAllAsRead,
} = require("../controllers/notification");

router.get(
  "/notifications",
  asyncHandler(getNotifications),
);

router.patch(
  "/notifications/read-all",
  asyncHandler(markAllAsRead),
);

module.exports = router;