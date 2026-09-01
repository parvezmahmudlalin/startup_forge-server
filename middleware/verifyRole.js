const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const userRole = req.user.role ? req.user.role.toLowerCase() : null;
    const formattedAllowedRoles = allowedRoles.map((role) => role.toLowerCase());

    if (!userRole || !formattedAllowedRoles.includes(userRole)) {
      console.log(`[Role Check Failed] Required: ${allowedRoles.join(", ")} | Provided: ${req.user.role}`);
      
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access requires one of these roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
};

module.exports = verifyRole;