const express = require("express");
const router = express.Router();

// =====================================================
// MIDDLEWARES
// =====================================================
const verifyToken = require("../middleware/verifyToken");
const verifyRole = require("../middleware/verifyRole");
const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// CONTROLLERS
// =====================================================
const {
  getFounderStartups,
  getSingleStartup,
  createStartup,
  updateStartup,
  deleteStartup,
  getAllStartups,
} = require("../controllers/startup");

// =====================================================
// PUBLIC ROUTES (No Token Required)
// =====================================================

// 1. Get All Public Startups (Homepage / Directory)
router.get("/startups", asyncHandler(getAllStartups));

// 2. Get Single Startup Details (Public Details Page)
// (একাধিক ডুপ্লিকেট পাথ সাপোর্ট রাখার জন্য)
router.get("/startups/:id", asyncHandler(getSingleStartup));
router.get("/startup/:id", asyncHandler(getSingleStartup));

// =====================================================
// FOUNDER & ADMIN PROTECTED ROUTES
// =====================================================

// 3. Get Founder's Own Startups List
router.get(
  "/founder/startups",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(getFounderStartups)
);
router.get(
  "/founder/startup",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(getFounderStartups)
);

// 4. Create New Startup
router.post(
  "/founder/startups",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(createStartup)
);
router.post(
  "/founder/startup",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(createStartup)
);

// 5. Update Existing Startup
router.put(
  "/founder/startups/:id",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(updateStartup)
);
router.put(
  "/founder/startup/:id",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(updateStartup)
);

// 6. Delete Startup
router.delete(
  "/founder/startups/:id",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(deleteStartup)
);
router.delete(
  "/founder/startup/:id",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(deleteStartup)
);

module.exports = router;