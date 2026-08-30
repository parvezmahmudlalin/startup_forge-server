const express = require("express");

const router = express.Router();

const {
  createCheckoutSession,
  verifyPaymentSession,
} = require("../controllers/payment");

const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// CREATE STRIPE CHECKOUT SESSION
// =====================================================

router.post(
  "/payment/create-checkout-session",
  asyncHandler(createCheckoutSession)
);

// =====================================================
// VERIFY PAYMENT
// =====================================================

router.get(
  "/payment/verify-session",
  asyncHandler(verifyPaymentSession)
);

module.exports = router;