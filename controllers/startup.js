const { getDB, isValidId, objectId } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

// GET /api/founder/startups
const getFounderStartups = async (req, res) => {
  const email = getEmail(req);
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  const startups = await getDB().collection("startup")
    .find({ founder_email: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(startups);
};

// POST /api/founder/startup
const createStartup = async (req, res) => {
  const { startup_name, logo, industry, description, funding_stage, founder_email } = req.body;

  if (!startup_name?.trim() || !industry?.trim() || !description?.trim() || !funding_stage || !founder_email) {
    return res.status(400).json({ success: false, message: "All required fields must be provided" });
  }

  const data = {
    startup_name: startup_name.trim(),
    logo: logo || "",
    industry: industry.trim(),
    description: description.trim(),
    funding_stage,
    founder_email: founder_email.trim(),
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await getDB().collection("startup").insertOne(data);
  res.status(201).json({ success: true, message: "Startup created successfully", startup: { _id: result.insertedId, ...data } });
};

// DELETE /api/founder/startup/:id
const deleteStartup = async (req, res) => {
  const { id } = req.params;
  const email = getEmail(req);

  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid ID format" });

  const filter = { _id: objectId(id), ...(email && { founder_email: email }) };
  const result = await getDB().collection("startup").deleteOne(filter);

  if (!result.deletedCount) return res.status(404).json({ success: false, message: "Startup not found or unauthorized" });

  res.json({ success: true, message: "Startup deleted successfully" });
};

module.exports = { getFounderStartups, createStartup, deleteStartup };