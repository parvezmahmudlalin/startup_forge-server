const { getDB } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

const getFounderOverview = async (req, res) => {
  // মিডলওয়্যার, কোয়েরি বা ইউজার অবজেক্ট থেকে ইমেইল নেওয়া
  let email = getEmail(req) || req.query.email || req.user?.email;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Founder email is required",
    });
  }

  email = String(email).trim();

  // Case-insensitive email query pattern
  const emailQuery = {
    founder_email: { $regex: new RegExp(`^${email}$`, "i") },
  };

  const db = getDB();

  try {
    const [totalOpportunities, totalApplications, acceptedMembers] =
      await Promise.all([
        db.collection("opportunities").countDocuments(emailQuery),

        db.collection("applications").countDocuments(emailQuery),

        db.collection("applications").countDocuments({
          ...emailQuery,
          status: { $regex: /^accepted$/i }, // Accepted, accepted, ACCEPTED—সবগুলোকে কাউন্ট করবে
        }),
      ]);

    res.json({
      success: true,
      stats: {
        totalOpportunities,
        totalApplications,
        acceptedMembers,
      },
    });
  } catch (error) {
    console.error("Error fetching founder overview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch founder overview stats",
    });
  }
};

module.exports = {
  getFounderOverview,
};