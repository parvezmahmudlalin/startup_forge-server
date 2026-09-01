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
  getAllOpportunities,
  getSingleOpportunity,
  getFounderOpportunities,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} = require("../controllers/opportunity");

// =====================================================
// PUBLIC ROUTES (No Token Needed)
// =====================================================

// 1. Browse All Opportunities (Homepage / Public List)
router.get(
  "/opportunities",
  asyncHandler(getAllOpportunities)
);

// 2. Get Single Opportunity Details
router.get(
  "/opportunities/:id",
  asyncHandler(getSingleOpportunity)
);

// =====================================================
// FOUNDER & ADMIN PROTECTED ROUTES
// =====================================================

// 3. Get Founder's Own Opportunities List
router.get(
  "/founder/opportunities",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(getFounderOpportunities)
);

// 4. Create New Opportunity
router.post(
  "/founder/opportunities",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(createOpportunity)
);

// 5. Update Existing Opportunity
router.put(
  "/founder/opportunities/:id",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(updateOpportunity)
);

// 6. Delete Opportunity
router.delete(
  "/founder/opportunities/:id",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(deleteOpportunity)
);

module.exports = router;