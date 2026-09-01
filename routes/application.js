const express = require("express");
const router = express.Router();

// =====================================================
// MIDDLEWARES
// =====================================================
const verifyToken = require("../middleware/verifyToken");
const verifyRole = require("../middleware/verifyRole");
const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// APPLICATION CONTROLLER
// =====================================================
const {
  createApplication,
  getMyApplications,
  getFounderApplications,
  updateApplicationStatus,
  getSingleApplication,
  deleteApplication,
} = require("../controllers/application");

// =====================================================
// COLLABORATOR / USER ROUTES (Loged in users)
// =====================================================

// 1. Create Application
router.post(
  "/applications",
  verifyToken,
  asyncHandler(createApplication)
);

// 2. Get User's Own Applications
router.get(
  "/applications/my-applications",
  verifyToken,
  asyncHandler(getMyApplications)
);

// 3. Get Single Application Details
router.get(
  "/applications/:id",
  verifyToken,
  asyncHandler(getSingleApplication)
);

// 4. Delete Application
router.delete(
  "/applications/:id",
  verifyToken,
  asyncHandler(deleteApplication)
);

// =====================================================
// FOUNDER SPECIFIC ROUTES (Requires Founder Role)
// =====================================================

// 5. Founder Applications List
router.get(
  "/founder/applications",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(getFounderApplications)
);

// 6. Accept / Reject Application Status
router.patch(
  "/founder/applications/:id",
  verifyToken,
  verifyRole("founder", "admin"),
  asyncHandler(updateApplicationStatus)
);

module.exports = router;