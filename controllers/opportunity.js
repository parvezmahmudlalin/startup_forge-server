const { getDB, isValidId, objectId } = require("../config/db");
const { getEmail } = require("../middleware/errorHandler");
const startupLookup = require("../utils/startupLookup");

const parseSkills = (skills) => {
  if (Array.isArray(skills)) {
    return skills
      .map(String)
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  if (typeof skills === "string") {
    return skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  return [];
};

// GET /api/opportunities
const getAllOpportunities = async (req, res) => {
  const { search, workType, limit } = req.query;

  const filter = {
    $or: [
      { status: { $regex: /^open$/i } },
      { status: { $exists: false } },
    ],
  };

  if (search) {
    filter.$and = [
      {
        $or: [
          {
            role_title: {
              $regex: search,
              $options: "i",
            },
          },
          {
            required_skills: {
              $regex: search,
              $options: "i",
            },
          },
        ],
      },
    ];
  }

  if (workType && workType !== "All") {
    filter.work_type = workType;
  }

  const pipeline = [
    { $match: filter },
    ...startupLookup,
    { $sort: { createdAt: -1 } },
  ];

  if (limit) {
    pipeline.push({ $limit: Number(limit) });
  }

  const result = await getDB()
    .collection("opportunities")
    .aggregate(pipeline)
    .toArray();

  res.json(result);
};

// GET /api/opportunities/:id
const getSingleOpportunity = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  const result = await getDB()
    .collection("opportunities")
    .aggregate([
      {
        $match: {
          _id: objectId(id),
        },
      },
      ...startupLookup,
    ])
    .toArray();

  if (!result.length) {
    return res.status(404).json({
      success: false,
      message: "Opportunity not found",
    });
  }

  res.json(result[0]);
};

// GET /api/founder/opportunities
const getFounderOpportunities = async (req, res) => {
  const email = getEmail(req);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Founder email required",
    });
  }

  const result = await getDB()
    .collection("opportunities")
    .aggregate([
      {
        $match: {
          founder_email: email,
        },
      },
      ...startupLookup,
      { $sort: { createdAt: -1 } },
    ])
    .toArray();

  res.json(result);
};

// POST /api/founder/opportunities
const createOpportunity = async (req, res) => {
  const {
    role_title,
    description,
    location,
    category,
    required_skills,
    work_type,
    commitment_level,
    deadline,
    founder_email,
    startup_id,
  } = req.body;

  if (!role_title?.trim() || !founder_email?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Role title and Founder Email are required.",
    });
  }

  const data = {
    startup_id:
      startup_id && isValidId(startup_id)
        ? objectId(startup_id)
        : startup_id,

    role_title: role_title.trim(),
    description: String(description || "").trim(),
    location: String(location || "Remote").trim(),
    category: String(category || "General").trim(),
    required_skills: parseSkills(required_skills),
    work_type: work_type || "Remote",
    commitment_level: commitment_level || "Full-time",
    deadline: deadline || null,
    founder_email: founder_email.trim(),
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await getDB()
    .collection("opportunities")
    .insertOne(data);

  res.status(201).json({
    success: true,
    message: "Opportunity created successfully!",
    insertedId: result.insertedId,
  });
};

// PUT /api/founder/opportunities/:id
const updateOpportunity = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Opportunity ID format",
    });
  }

  const {
    role_title,
    description,
    location,
    category,
    required_skills,
    work_type,
    commitment_level,
    deadline,
  } = req.body;

  const result = await getDB()
    .collection("opportunities")
    .updateOne(
      { _id: objectId(id) },
      {
        $set: {
          role_title: role_title?.trim(),
          description: description?.trim(),
          location,
          category,
          required_skills: parseSkills(required_skills),
          work_type,
          commitment_level,
          deadline,
          updatedAt: new Date(),
        },
      },
    );

  if (!result.matchedCount) {
    return res.status(404).json({
      success: false,
      message: "Opportunity not found",
    });
  }

  res.json({
    success: true,
    message: "Opportunity updated successfully",
  });
};

// DELETE /api/founder/opportunities/:id
const deleteOpportunity = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Opportunity ID format",
    });
  }

  const result = await getDB()
    .collection("opportunities")
    .deleteOne({
      _id: objectId(id),
    });

  if (!result.deletedCount) {
    return res.status(404).json({
      success: false,
      message: "Opportunity not found",
    });
  }

  res.json({
    success: true,
    message: "Opportunity deleted successfully",
  });
};

module.exports = {
  getAllOpportunities,
  getSingleOpportunity,
  getFounderOpportunities,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
};