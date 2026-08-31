const { getDB } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

// =====================================================
// GET NOTIFICATIONS
// GET /api/notifications?email=...&role=...
// =====================================================
const getNotifications = async (req, res) => {
  let email = getEmail(req) || req.query.email;
  const role = req.query.role?.toLowerCase();

  const db = getDB();
  const query = {};

  // Admin হলে সাধারণ admin নোটিফিকেশন অথবা নির্দিষ্ট email সম্পর্কিত নোটিফিকেশন ফিল্টার
  if (role === "admin") {
    query.$or = [
      { role: "admin" },
      ...(email ? [{ recipient_email: { $regex: new RegExp(`^${String(email).trim()}$`, "i") } }] : []),
    ];
  } else if (email) {
    email = String(email).trim();
    query.recipient_email = { $regex: new RegExp(`^${email}$`, "i") };
  } else {
    return res.json([]);
  }

  const result = await db
    .collection("notifications")
    .find(query)
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();

  res.json(result);
};

// =====================================================
// MARK ALL AS READ
// PATCH /api/notifications?email=...
// =====================================================
const markAllAsRead = async (req, res) => {
  let email = getEmail(req) || req.query.email || req.body.email;
  const role = req.body.role?.toLowerCase() || req.query.role?.toLowerCase();

  if (!email && role !== "admin") {
    return res.status(400).json({
      success: false,
      message: "Email or Role is required",
    });
  }

  const db = getDB();
  const query = {};

  if (role === "admin") {
    query.$or = [
      { role: "admin" },
      ...(email ? [{ recipient_email: { $regex: new RegExp(`^${String(email).trim()}$`, "i") } }] : []),
    ];
  } else {
    email = String(email).trim();
    query.recipient_email = { $regex: new RegExp(`^${email}$`, "i") };
  }

  // isRead, read, unread — সব ধরনের স্টেটাসের জন্য সেফ আপডেট
  await db.collection("notifications").updateMany(query, {
    $set: {
      isRead: true,
      read: true,
      unread: false,
      updatedAt: new Date(),
    },
  });

  res.json({
    success: true,
    message: "Notifications marked as read",
  });
};

module.exports = {
  getNotifications,
  markAllAsRead,
};