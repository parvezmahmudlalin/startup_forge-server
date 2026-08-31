const { getDB } = require("../config/db");
const { ObjectId } = require("mongodb");

const isValidObjectId = (id) => ObjectId.isValid(id);

// 1. ADMIN STATS
exports.getAdminStats = async (req, res) => {
  try {
    const db = getDB();

    const [
      totalUsers,
      totalStartups,
      totalOpportunities,
      approvedStartups,
      paidTransactions,
    ] = await Promise.all([
      db.collection("user").countDocuments(),
      db.collection("startup").countDocuments(),
      db.collection("opportunities").countDocuments(),
      db.collection("startup").countDocuments({ status: "Approved" }),
      db.collection("payments").find({
        payment_status: {
          $in: ["paid", "Paid", "completed", "Completed", "succeeded"],
        },
      }).toArray(),
    ]);

    const totalRevenue = paidTransactions.reduce((total, payment) => {
      return total + Number(payment.amount || 0);
    }, 0);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalStartups,
        totalOpportunities,
        totalApproved: approvedStartups,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load admin statistics",
    });
  }
};

// 2. GET ALL USERS
exports.getAllUsers = async (req, res) => {
  try {
    const db = getDB();
    const users = await db
      .collection("user")
      .find({})
      .project({ password: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

// 3. UPDATE USER ROLE
exports.updateUserRole = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const allowedRoles = ["user", "founder", "collaborator", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const result = await db.collection("user").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { role, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "User role updated successfully",
      user: result,
    });
  } catch (error) {
    console.error("Update role error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user role",
    });
  }
};

// 4. BLOCK / UNBLOCK USER
exports.updateUserBlockStatus = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (typeof isBlocked !== "boolean") {
      return res.status(400).json({ success: false, message: "isBlocked must be true or false" });
    }

    const result = await db.collection("user").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { isBlocked, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: isBlocked ? "User blocked successfully" : "User unblocked successfully",
      user: result,
    });
  } catch (error) {
    console.error("Block user error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
    });
  }
};

// 5. ACCEPT / REJECT USER (NEW)
exports.updateUserStatus = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const allowedStatuses = ["Pending", "Approved", "Rejected"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const result = await db.collection("user").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      user: result,
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
    });
  }
};

// 6. DELETE USER
exports.deleteUser = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const result = await db.collection("user").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
    });
  }
};

// 7. GET ALL STARTUPS
exports.getAllStartups = async (req, res) => {
  try {
    const db = getDB();
    const startups = await db
      .collection("startup")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      startups,
    });
  } catch (error) {
    console.error("Get startups error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch startups",
    });
  }
};

// 8. APPROVE / REJECT STARTUP
exports.updateStartupStatus = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid startup ID" });
    }

    const allowedStatuses = ["Pending", "Approved", "Rejected"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid startup status" });
    }

    const result = await db.collection("startup").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: "Startup not found" });
    }

    return res.status(200).json({
      success: true,
      message: `Startup ${status.toLowerCase()} successfully`,
      startup: result,
    });
  } catch (error) {
    console.error("Update startup status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update startup status",
    });
  }
};

// 9. DELETE STARTUP
exports.deleteStartup = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid startup ID" });
    }

    const result = await db.collection("startup").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Startup not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Startup deleted successfully",
    });
  } catch (error) {
    console.error("Delete startup error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete startup",
    });
  }
};

// 10. GET ALL TRANSACTIONS
exports.getAllTransactions = async (req, res) => {
  try {
    const db = getDB();
    const transactions = await db
      .collection("payments")
      .find({})
      .sort({ paid_at: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      transactions,
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
};