const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../middleware/errorHandler");
const { getFounderStartups, createStartup, deleteStartup } = require("../controllers/startup");

router.get("/founder/startups", asyncHandler(getFounderStartups));
router.get("/founder/startup", asyncHandler(getFounderStartups));
router.post("/founder/startup", asyncHandler(createStartup));
router.delete("/founder/startup/:id", asyncHandler(deleteStartup));

module.exports = router;