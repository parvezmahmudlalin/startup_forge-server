const express = require("express");
const router = express.Router();

// =====================================================
// MIDDLEWARES
// =====================================================
const verifyToken = require("../middleware/verifyToken");
const verifyRole = require("../middleware/verifyRole");
const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// ADMIN CONTROLLER
// =====================================================
const {
  getAdminStats,
  getAllUsers,
  updateUserRole,
  updateUserBlockStatus,
  updateUserStatus,
  deleteUser,
  getAllStartups,
  updateStartupStatus,
  deleteStartup,
  getAllTransactions,
} = require("../controllers/adminController");

// =====================================================
// GLOBAL ADMIN SECURITY GUARD
// =====================================================
// এই ফাইলটির প্রতিটি অ্যান্ডপয়েন্টে প্রবেশের আগে টোকেন ও অ্যাডমিন রোল ভ্যালিড হতে হবে
router.use(verifyToken, verifyRole("admin"));

// =====================================================
// STATS & USERS ROUTES
// =====================================================
router.get("/stats", asyncHandler(getAdminStats));
router.get("/users", asyncHandler(getAllUsers));

router.patch("/users/:id/role", asyncHandler(updateUserRole));
router.patch("/users/:id/block", asyncHandler(updateUserBlockStatus));
router.patch("/users/:id/status", asyncHandler(updateUserStatus));

router.delete("/users/:id", asyncHandler(deleteUser));

// =====================================================
// STARTUPS ROUTES
// =====================================================
router.get("/startups", asyncHandler(getAllStartups));

router.patch("/startups/:id", asyncHandler(updateStartupStatus));
router.delete("/startups/:id", asyncHandler(deleteStartup));

// =====================================================
// TRANSACTIONS ROUTES
// =====================================================
router.get("/transactions", asyncHandler(getAllTransactions));

// =====================================================
// EXPORT ROUTER
// =====================================================
module.exports = router;