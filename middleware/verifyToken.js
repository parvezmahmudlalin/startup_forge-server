const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

// CLIENT_URL থেকে trailing slash কেটে পরিষ্কার করা
const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

const JWKS = createRemoteJWKSet(
  new URL(`${clientUrl}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token is missing",
      });
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid authorization format",
      });
    }

    // JWT Verify
    const { payload } = await jwtVerify(token, JWKS);

    // User info req.user-এ অ্যাসাইন
    req.user = payload;

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(403).json({
      success: false,
      message: "Forbidden: Invalid or expired token",
    });
  }
};

module.exports = verifyToken;