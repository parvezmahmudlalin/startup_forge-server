const express = require("express");

const router = express.Router();

const { asyncHandler } = require("../middleware/errorHandler");

const {
  getFounderOverview,
} = require("../controllers/founder");

router.get(
  "/founder/overview",
  asyncHandler(getFounderOverview),
);

module.exports = router;