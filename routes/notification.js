const express = require("express");
const router = express.Router();

// =====================================================
// MIDDLEWARES
// =====================================================
const verifyToken = require("../middleware/verifyToken");
const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// CONTROLLERS
// =====================================================
const {
  getNotifications,
  markAllAsRead,
  markSingleAsRead, // (ঐচ্ছিক) একক নোটিফিকেশনের জন্য
} = require("../controllers/notification");

// =====================================================
// NOTIFICATION ROUTES (All routes require Auth Token)
// =====================================================

// 1. GET User's Notifications
router.get(
  "/notifications",
  verifyToken,
  asyncHandler(getNotifications)
);

// 2. PATCH: Mark all notifications as read (Frontend Path Support)
router.patch(
  "/notifications",
  verifyToken,
  asyncHandler(markAllAsRead)
);

router.patch(
  "/notifications/read-all",
  verifyToken,
  asyncHandler(markAllAsRead)
);

// 3. PATCH: Mark single notification as read (যদি কন্ট্রোলারে থাকে)
if (markSingleAsRead) {
  router.patch(
    "/notifications/:id/read",
    verifyToken,
    asyncHandler(markSingleAsRead)
  );
}

module.exports = router;