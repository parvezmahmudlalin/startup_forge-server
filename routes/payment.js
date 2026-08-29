const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../middleware/errorHandler");
const { createPaymentIntent } = require("../controllers/payment");

router.post("/create-payment-intent", asyncHandler(createPaymentIntent));

module.exports = router;