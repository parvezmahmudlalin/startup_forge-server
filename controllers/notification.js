const { getDB } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

const getNotifications = async (req, res) => {
  const email = getEmail(req);

  if (!email) {
    return res.json([]);
  }

  const result = await getDB()
    .collection("notifications")
    .find({
      recipient_email: email,
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  res.json(result);
};

const markAllAsRead = async (req, res) => {
  const email = getEmail(req);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  await getDB()
    .collection("notifications")
    .updateMany(
      {
        recipient_email: email,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
        },
      },
    );

  res.json({
    success: true,
    message: "Notifications marked as read",
  });
};

module.exports = {
  getNotifications,
  markAllAsRead,
};