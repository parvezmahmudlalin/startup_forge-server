const { getDB, isValidId, objectId } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

// GET /api/founder/opportunities
const getFounderOpportunities = async (req, res) => {
  const email = getEmail(req);
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  const opportunities = await getDB().collection("opportunity")
    .find({ founder_email: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(opportunities);
};

// POST /api/founder/opportunity
const createOpportunity = async (req, res) => {
  const { title, description, category, deadline, founder_email, startup_id } = req.body;

  if (!title?.trim() || !category?.trim() || !founder_email) {
    return res.status(400).json({ success: false, message: "Required fields are missing" });
  }

  const data = {
    title: title.trim(),
    description: description || "",
    category: category.trim(),
    deadline: deadline ? new Date(deadline) : null,
    founder_email: founder_email.trim(),
    startup_id: isValidId(startup_id) ? objectId(startup_id) : null,
    createdAt: new Date(),
  };

  const result = await getDB().collection("opportunity").insertOne(data);
  res.status(201).json({ success: true, message: "Opportunity created", id: result.insertedId });
};

module.exports = { getFounderOpportunities, createOpportunity };