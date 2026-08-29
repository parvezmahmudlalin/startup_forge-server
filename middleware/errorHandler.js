const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((error) => {
    console.error("❌ API Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  });

const getEmail = (req) =>
  typeof (req.query.email || req.body?.email) === "string"
    ? (req.query.email || req.body.email).trim()
    : "";

module.exports = { asyncHandler, getEmail };