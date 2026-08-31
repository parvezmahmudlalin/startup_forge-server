const express = require("express");
const router = express.Router();

const {
  getAdminStats,
  getAllUsers,
  updateUserRole,
  updateUserBlockStatus,
  updateUserStatus, // <-- Accept/Reject Controller Import
  deleteUser,
  getAllStartups,
  updateStartupStatus,
  deleteStartup,
  getAllTransactions,
} = require("../controllers/adminController");

// Stats & Users Routes
router.get("/stats", getAdminStats);
router.get("/users", getAllUsers);
router.patch("/users/:id/role", updateUserRole);
router.patch("/users/:id/block", updateUserBlockStatus);
router.patch("/users/:id/status", updateUserStatus); // <-- Accept/Reject Status Route
router.delete("/users/:id", deleteUser);

// Startups Routes
router.get("/startups", getAllStartups);
router.patch("/startups/:id", updateStartupStatus);
router.delete("/startups/:id", deleteStartup);

// Transactions Routes
router.get("/transactions", getAllTransactions);

module.exports = router;