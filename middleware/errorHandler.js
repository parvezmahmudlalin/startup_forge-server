const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    console.error("API Error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  });
};

const getEmail = (req) => {
  const email = req.query.email || req.body?.email;

  return typeof email === "string" ? email.trim() : "";
};

module.exports = {
  asyncHandler,
  getEmail,
};