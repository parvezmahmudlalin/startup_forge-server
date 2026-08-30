const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const { getDB } = require("../config/db");

// =====================================================
// CREATE CHECKOUT SESSION
// =====================================================

const createCheckoutSession = async (req, res) => {
  const { email, startupData } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  if (!startupData) {
    return res.status(400).json({
      success: false,
      message: "Startup data is required",
    });
  }

  const db = getDB();

  const startups = db.collection("startup");

  // ===================================================
  // COUNT FOUNDER STARTUPS
  // ===================================================

  const startupCount = await startups.countDocuments({
    founder_email: email.trim(),
  });

  // ===================================================
  // FIRST 3 STARTUPS ARE FREE
  // ===================================================

  if (startupCount < 3) {
    return res.json({
      success: true,
      requiresPayment: false,
      message: "Free startup limit available",
    });
  }

  // ===================================================
  // PAYMENT REQUIRED
  // ===================================================

  const origin =
    req.headers.origin ||
    process.env.CLIENT_URL ||
    "http://localhost:3000";

  // Stripe metadata only accepts strings
  const metadata = {
    startup_name: String(startupData.startup_name || ""),
    industry: String(startupData.industry || ""),
    description: String(startupData.description || ""),
    funding_stage: String(startupData.funding_stage || ""),
    logo: String(startupData.logo || ""),
    founder_email: email.trim(),
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],

    line_items: [
      {
        price_data: {
          currency: "usd",

          product_data: {
            name: "Startup Creation Fee",
            description:
              "Payment required after the first 3 free startups.",
          },

          // $10
          unit_amount: 1000,
        },

        quantity: 1,
      },
    ],

    mode: "payment",

    customer_email: email.trim(),

    metadata,

    success_url:
      `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

    cancel_url:
      `${origin}/dashboard/founder/post-opportunity?canceled=true`,
  });

  res.json({
    success: true,
    requiresPayment: true,
    checkoutUrl: session.url,
  });
};

// =====================================================
// VERIFY PAYMENT + CREATE STARTUP
// =====================================================

const verifyPaymentSession = async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({
      success: false,
      message: "Session ID is required",
    });
  }

  // ===================================================
  // GET STRIPE SESSION
  // ===================================================

  const session =
    await stripe.checkout.sessions.retrieve(session_id);

  // ===================================================
  // CHECK PAYMENT
  // ===================================================

  if (session.payment_status !== "paid") {
    return res.status(400).json({
      success: false,
      message: "Payment incomplete",
    });
  }

  const db = getDB();

  const payments = db.collection("payments");
  const startups = db.collection("startup");

  // ===================================================
  // CHECK DUPLICATE PAYMENT
  // ===================================================

  let payment = await payments.findOne({
    transactionId: session.id,
  });

  // ===================================================
  // GET STARTUP DATA FROM STRIPE METADATA
  // ===================================================

  const startupData = session.metadata;

  if (
    !startupData ||
    !startupData.startup_name ||
    !startupData.industry ||
    !startupData.description ||
    !startupData.founder_email
  ) {
    return res.status(400).json({
      success: false,
      message: "Startup data is missing from payment session",
    });
  }

  // ===================================================
  // CHECK IF THIS PAYMENT ALREADY CREATED STARTUP
  // ===================================================

  let startup;

  if (payment?.startupId) {
    startup = await startups.findOne({
      _id: payment.startupId,
    });
  }

  // ===================================================
  // CREATE STARTUP ONLY ONCE
  // ===================================================

  if (!startup) {
    const startupDocument = {
      startup_name: startupData.startup_name,
      logo: startupData.logo || "",
      industry: startupData.industry,
      description: startupData.description,
      funding_stage:
        startupData.funding_stage || "Pre-seed",

      founder_email:
        startupData.founder_email,

      status: "pending",

      createdAt: new Date(),
      updatedAt: new Date(),

      // Useful for paid startup tracking
      payment_required: true,
      payment_status: "paid",
      payment_transaction_id: session.id,
    };

    const result = await startups.insertOne(
      startupDocument
    );

    startup = {
      _id: result.insertedId,
      ...startupDocument,
    };
  }

  // ===================================================
  // SAVE PAYMENT
  // ===================================================

  if (!payment) {
    payment = {
      transactionId: session.id,

      email:
        session.customer_email ||
        startupData.founder_email,

      amount:
        (session.amount_total || 0) / 100,

      currency:
        session.currency || "usd",

      status: "completed",

      startupId: startup._id,

      createdAt: new Date(),
    };

    await payments.insertOne(payment);
  }

  // ===================================================
  // RESPONSE
  // ===================================================

  res.json({
    success: true,

    message:
      "Payment verified and startup created successfully",

    payment: {
      user_email:
        session.customer_email ||
        payment.email,

      amount:
        (session.amount_total || 0) / 100,

      transaction_id:
        session.id,

      payment_status: "Completed",
    },

    startup: {
      _id: startup._id,
      startup_name: startup.startup_name,
    },
  });
};

module.exports = {
  createCheckoutSession,
  verifyPaymentSession,
};