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
const { updateProfile, getProfile } = require("../controllers/profile");

// =====================================================
// PROTECTED PROFILE ROUTES
// =====================================================

// 1. Get User Profile (যদি প্রয়োজন থাকে)
if (getProfile) {
  router.get(
    "/users/profile",
    verifyToken,
    asyncHandler(getProfile)
  );
}

// 2. Update User Profile
router.put(
  "/users/profile",
  verifyToken,
  asyncHandler(updateProfile)
);

module.exports = router;