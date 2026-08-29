const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// POST /api/create-payment-intent
const createPaymentIntent = async (req, res) => {
  const { amount, currency = "usd" } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // convert to cents
    currency,
  });

  res.json({ clientSecret: paymentIntent.client_secret });
};

module.exports = { createPaymentIntent };