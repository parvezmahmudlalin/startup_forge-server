const { getDB } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

const getFounderOverview = async (req, res) => {
  const email = getEmail(req);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Founder email required",
    });
  }

  const db = getDB();

  const [totalOpportunities, totalApplications, acceptedMembers] =
    await Promise.all([
      db.collection("opportunities").countDocuments({
        founder_email: email,
      }),

      db.collection("applications").countDocuments({
        founder_email: email,
      }),

      db.collection("applications").countDocuments({
        founder_email: email,
        status: "Accepted",
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
};

module.exports = {
  getFounderOverview,
};