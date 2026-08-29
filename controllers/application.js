const { getDB, isValidId, objectId } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

// GET /api/applications
const getApplications = async (req, res) => {
  const email = getEmail(req);
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  const apps = await getDB().collection("application")
    .find({ applicant_email: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(apps);
};

// PATCH /api/application/:id/status
const updateApplicationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

  const result = await getDB().collection("application").updateOne(
    { _id: objectId(id) },
    { $set: { status, updatedAt: new Date() } }
  );

  res.json({ success: true, modifiedCount: result.modifiedCount });
};

module.exports = { getApplications, updateApplicationStatus };