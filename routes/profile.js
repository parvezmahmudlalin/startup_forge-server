const express = require("express");

const router = express.Router();

const { asyncHandler } = require("../middleware/errorHandler");

const {
  updateProfile,
} = require("../controllers/profile");

router.put(
  "/users/profile",
  asyncHandler(updateProfile),
);

module.exports = router;