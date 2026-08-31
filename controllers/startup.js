const { getDB, isValidId, objectId } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");

// GET /api/founder/startups
const getFounderStartups = async (req, res) => {
  const email = getEmail(req);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  const startups = await getDB()
    .collection("startup")
    .find({ founder_email: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(startups);
};

// GET /api/founder/startup/:id
const getSingleStartup = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid startup ID format",
    });
  }

  const startup = await getDB()
    .collection("startup")
    .findOne({ _id: objectId(id) });

  if (!startup) {
    return res.status(404).json({
      success: false,
      message: "Startup not found",
    });
  }

  res.json(startup);
};

// POST /api/founder/startup
const createStartup = async (req, res) => {
  const {
    startup_name,
    logo,
    industry,
    description,
    funding_stage,
    founder_email,
  } = req.body;

  if (
    !startup_name?.trim() ||
    !industry?.trim() ||
    !description?.trim() ||
    !funding_stage ||
    !founder_email?.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "All required fields must be provided",
    });
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

  const db = getDB();
  const result = await db.collection("startup").insertOne(data);

  // 🟢 🔔 Admin Notification for New Startup Creation
  await db.collection("notifications").insertOne({
    role: "admin",
    title: "New Startup Created",
    message: `Founder (${data.founder_email}) created a new startup "${data.startup_name}".`,
    isRead: false,
    read: false,
    unread: true,
    createdAt: new Date(),
  });

  res.status(201).json({
    success: true,
    message: "Startup created successfully",
    startup: {
      _id: result.insertedId,
      ...data,
    },
  });
};

// PUT /api/founder/startup/:id
const updateStartup = async (req, res) => {
  const { id } = req.params;

  const {
    startup_name,
    logo,
    industry,
    description,
    funding_stage,
    founder_email,
    status, // Status update support (Admin Accept/Reject or Founder Edit)
  } = req.body;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid startup ID format",
    });
  }

  const db = getDB();

  // আগের স্টার্টআপ অবজেক্ট খুঁজে বের করা নোটিফিকেশনের মেসেজের জন্য
  const existingStartup = await db.collection("startup").findOne({ _id: objectId(id) });

  if (!existingStartup) {
    return res.status(404).json({
      success: false,
      message: "Startup not found",
    });
  }

  const updateFields = {
    ...(startup_name && { startup_name: startup_name.trim() }),
    ...(logo !== undefined && { logo }),
    ...(industry && { industry: industry.trim() }),
    ...(description && { description: description.trim() }),
    ...(funding_stage && { funding_stage }),
    ...(status && { status: status.toLowerCase() }),
    updatedAt: new Date(),
  };

  const query = { _id: objectId(id) };
  if (founder_email?.trim() && !status) {
    query.founder_email = founder_email.trim();
  }

  const result = await db.collection("startup").updateOne(query, {
    $set: updateFields,
  });

  if (!result.matchedCount) {
    return res.status(404).json({
      success: false,
      message: "Startup not found or unauthorized",
    });
  }

  // 🟢 🔔 Admin accept/reject করলে Founder নোটিফিকেশন পাবে
  if (status && status.toLowerCase() !== existingStartup.status?.toLowerCase()) {
    const targetEmail = existingStartup.founder_email || founder_email;
    if (targetEmail) {
      await db.collection("notifications").insertOne({
        recipient_email: targetEmail.toLowerCase(),
        role: "founder",
        title: `Startup ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your startup "${existingStartup.startup_name}" status has been updated to "${status}".`,
        isRead: false,
        read: false,
        unread: true,
        createdAt: new Date(),
      });
    }
  }

  res.json({
    success: true,
    message: "Startup updated successfully",
  });
};

// DELETE /api/founder/startup/:id
const deleteStartup = async (req, res) => {
  const { id } = req.params;
  const email = getEmail(req);

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid startup ID format",
    });
  }

  const filter = {
    _id: objectId(id),
    ...(email && { founder_email: email }),
  };

  const result = await getDB()
    .collection("startup")
    .deleteOne(filter);

  if (!result.deletedCount) {
    return res.status(404).json({
      success: false,
      message: "Startup not found or unauthorized",
    });
  }

  res.json({
    success: true,
    message: "Startup deleted successfully",
  });
};

// GET /api/startups (Browse Startups Page)
const getAllStartups = async (req, res) => {
  try {
    const startups = await getDB()
      .collection("startup")
      .find({
        $or: [
          { status: { $exists: false } },
          { status: { $ne: "rejected" } }
        ]
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ success: true, data: startups });
  } catch (error) {
    console.error("Error fetching startups:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getFounderStartups,
  getSingleStartup,
  createStartup,
  updateStartup,
  deleteStartup,
  getAllStartups,
};