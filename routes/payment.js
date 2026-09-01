const express = require("express");
const router = express.Router();

// =====================================================
// MIDDLEWARES
// =====================================================
const verifyToken = require("../middleware/verifyToken");
const { asyncHandler } = require("../middleware/errorHandler");

// =====================================================
// CONTROLLERS
// =====================================================
const {
  createCheckoutSession,
  verifyPaymentSession,
} = require("../controllers/payment");

// =====================================================
// PROTECTED PAYMENT ROUTES (Requires Auth Token)
// =====================================================

// 1. Create Stripe Checkout Session
router.post(
  "/payment/create-checkout-session",
  verifyToken,
  asyncHandler(createCheckoutSession)
);

// 2. Verify Payment Session
router.get(
  "/payment/verify-session",
  verifyToken,
  asyncHandler(verifyPaymentSession)
);

module.exports = router;