const express = require("express");
const router = express.Router();

// =====================================================
// MIDDLEWARES
// =====================================================
const verifyToken = require("../middleware/verifyToken");
const verifyRole = require("../middleware/verifyRole");

// =====================================================
// ERROR HANDLER
// =====================================================
const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// CONTROLLERS
// =====================================================
const { getFounderOverview } = require("../controllers/founder");

// =====================================================
// FOUNDER ROUTES
// =====================================================

// 🔒 Protected: Only Founder and Admin can access overview
router.get(
  "/founder/overview",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(getFounderOverview)
);

module.exports = router;