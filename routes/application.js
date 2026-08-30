const express = require("express");

const router = express.Router();

const {
  createApplication,
  getMyApplications,
  getFounderApplications,
  updateApplicationStatus,
  getSingleApplication,
  deleteApplication,
} = require("../controllers/application");

const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// COLLABORATOR
// =====================================================

// Apply to an opportunity
router.post(
  "/applications",
  asyncHandler(createApplication)
);

// My applications
router.get(
  "/my-applications",
  asyncHandler(getMyApplications)
);

// Single application
router.get(
  "/applications/:id",
  asyncHandler(getSingleApplication)
);

// Delete application
router.delete(
  "/applications/:id",
  asyncHandler(deleteApplication)
);

// =====================================================
// FOUNDER
// =====================================================

// Founder applications
router.get(
  "/founder/applications",
  asyncHandler(getFounderApplications)
);

// Accept / Reject application
router.patch(
  "/founder/applications/:id",
  asyncHandler(updateApplicationStatus)
);

module.exports = router;