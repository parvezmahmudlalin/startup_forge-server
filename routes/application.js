const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../middleware/errorHandler");
const { getApplications, updateApplicationStatus } = require("../controllers/application");

router.get("/applications", asyncHandler(getApplications));
router.patch("/application/:id/status", asyncHandler(updateApplicationStatus));

module.exports = router;