const express = require("express");
const router = express.Router();

const {
  getFounderStartups,
  getSingleStartup,
  createStartup,
  updateStartup,
  deleteStartup,
  getAllStartups, 
} = require("../controllers/startup");

const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// STARTUP ROUTES
// =====================================================


router.get("/startups", asyncHandler(getAllStartups));

router.get("/startup/:id", asyncHandler(getSingleStartup));
router.get("/startup/:id", asyncHandler(getSingleStartup)); // Public details by ID

// Public details route for startups/[id] page
router.get("/startups/:id", asyncHandler(getSingleStartup));

// Founder private routes
router.get("/founder/startups", asyncHandler(getFounderStartups));
router.get("/founder/startup", asyncHandler(getFounderStartups));
router.get("/founder/startup/:id", asyncHandler(getSingleStartup));

router.post("/founder/startup", asyncHandler(createStartup));
router.put("/founder/startup/:id", asyncHandler(updateStartup));
router.delete("/founder/startup/:id", asyncHandler(deleteStartup));

module.exports = router;