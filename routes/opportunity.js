const express = require("express");

const router = express.Router();

const { asyncHandler } = require("../middleware/errorHandler");

const {
  getAllOpportunities,
  getSingleOpportunity,
  getFounderOpportunities,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} = require("../controllers/opportunity");

router.get(
  "/opportunities",
  asyncHandler(getAllOpportunities),
);

router.get(
  "/opportunities/:id",
  asyncHandler(getSingleOpportunity),
);

router.get(
  "/founder/opportunities",
  asyncHandler(getFounderOpportunities),
);

router.post(
  "/founder/opportunities",
  asyncHandler(createOpportunity),
);

router.put(
  "/founder/opportunities/:id",
  asyncHandler(updateOpportunity),
);

router.delete(
  "/founder/opportunities/:id",
  asyncHandler(deleteOpportunity),
);

module.exports = router;