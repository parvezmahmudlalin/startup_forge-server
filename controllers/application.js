const {
  getDB,
  isValidId,
  objectId,
} = require("../config/db");

const { getEmail } = require("../middleware/errorHandler");

// =====================================================
// CREATE APPLICATION
// POST /api/applications
// =====================================================

const createApplication = async (req, res) => {
  const {
    opportunity_id,
    collaborator_name,
    collaborator_email,
    phone,
    skills,
    experience,
    cover_letter,
    resume_link,
  } = req.body;

  // ---------------------------------------------------
  // Validation
  // ---------------------------------------------------

  if (!opportunity_id || !isValidId(opportunity_id)) {
    return res.status(400).json({
      success: false,
      message: "Valid opportunity ID is required.",
    });
  }

  if (!collaborator_email?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Collaborator email is required.",
    });
  }

  if (!cover_letter?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Cover letter is required.",
    });
  }

  const db = getDB();

  // ---------------------------------------------------
  // Find opportunity
  // ---------------------------------------------------

  const opportunity = await db
    .collection("opportunities")
    .findOne({
      _id: objectId(opportunity_id),
    });

  if (!opportunity) {
    return res.status(404).json({
      success: false,
      message: "Opportunity not found.",
    });
  }

  // ---------------------------------------------------
  // Check opportunity status
  // ---------------------------------------------------

  if (
    opportunity.status &&
    opportunity.status.toLowerCase() !== "open"
  ) {
    return res.status(400).json({
      success: false,
      message: "This opportunity is no longer accepting applications.",
    });
  }

  // ---------------------------------------------------
  // Check deadline
  // ---------------------------------------------------

  if (opportunity.deadline) {
    const deadline = new Date(opportunity.deadline);

    if (
      !Number.isNaN(deadline.getTime()) &&
      deadline < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Application deadline has passed.",
      });
    }
  }

  // ---------------------------------------------------
  // Prevent duplicate application
  // ---------------------------------------------------

  const existingApplication = await db
    .collection("applications")
    .findOne({
      opportunity_id: objectId(opportunity_id),
      collaborator_email: collaborator_email
        .trim()
        .toLowerCase(),
    });

  if (existingApplication) {
    return res.status(409).json({
      success: false,
      message: "You have already applied to this opportunity.",
    });
  }

  // ---------------------------------------------------
  // Prepare skills
  // ---------------------------------------------------

  let parsedSkills = [];

  if (Array.isArray(skills)) {
    parsedSkills = skills
      .map((skill) => String(skill).trim())
      .filter(Boolean);
  } else if (typeof skills === "string") {
    parsedSkills = skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  // ---------------------------------------------------
  // Application document
  // ---------------------------------------------------

  const application = {
    opportunity_id: objectId(opportunity_id),

    startup_id:
      opportunity.startup_id &&
      isValidId(String(opportunity.startup_id))
        ? objectId(String(opportunity.startup_id))
        : opportunity.startup_id || null,

    founder_email:
      opportunity.founder_email?.trim().toLowerCase() || null,

    collaborator_name:
      collaborator_name?.trim() || "Collaborator",

    collaborator_email:
      collaborator_email.trim().toLowerCase(),

    phone:
      phone?.trim() || "",

    skills: parsedSkills,

    experience:
      experience?.trim() || "",

    cover_letter:
      cover_letter.trim(),

    resume_link:
      resume_link?.trim() || "",

    status: "Pending",

    createdAt: new Date(),

    updatedAt: new Date(),
  };

  const result = await db
    .collection("applications")
    .insertOne(application);

  // ---------------------------------------------------
  // 🟢 Send Notification to Founder
  // ---------------------------------------------------
  if (application.founder_email) {
    await db.collection("notifications").insertOne({
      recipient_email: application.founder_email,
      role: "founder",
      title: "New Application Received",
      message: `${application.collaborator_name} applied for ${opportunity.title || "an opportunity"}.`,
      isRead: false,
      read: false,
      unread: true,
      createdAt: new Date(),
    });
  }

  res.status(201).json({
    success: true,
    message: "Application submitted successfully!",
    applicationId: result.insertedId,
  });
};

// =====================================================
// GET MY APPLICATIONS
// GET /api/my-applications?email=
// =====================================================

const getMyApplications = async (req, res) => {
  const email = req.query.email || getEmail(req);
  const db = getDB();

  const applications = await db
    .collection("applications")
    .aggregate([
      {
        $match: {
          collaborator_email: email.trim().toLowerCase(),
        },
      },
      
      {
        $addFields: {
          startup_id_obj: {
            $cond: {
              if: { $eq: [{ $type: "$startup_id" }, "string"] },
              then: { $toObjectId: "$startup_id" },
              else: "$startup_id",
            },
          },
        },
      },
      {
        $lookup: {
          from: "opportunities",
          localField: "opportunity_id",
          foreignField: "_id",
          as: "opportunity_details",
        },
      },
      {
        $unwind: {
          path: "$opportunity_details",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "startups",
          localField: "startup_id_obj",
          foreignField: "_id",
          as: "startup_details",
        },
      },
      {
        $unwind: {
          path: "$startup_details",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ])
    .toArray();

  res.json(applications);
};

// =====================================================
// GET SINGLE APPLICATION
// GET /api/applications/:id
// =====================================================

const getSingleApplication = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid application ID.",
    });
  }

  const db = getDB();

  const result = await db
    .collection("applications")
    .aggregate([
      {
        $match: {
          _id: objectId(id),
        },
      },

      {
        $lookup: {
          from: "opportunities",
          localField: "opportunity_id",
          foreignField: "_id",
          as: "opportunity_details",
        },
      },

      {
        $unwind: {
          path: "$opportunity_details",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "startups",
          localField: "startup_id",
          foreignField: "_id",
          as: "startup_details",
        },
      },

      {
        $unwind: {
          path: "$startup_details",
          preserveNullAndEmptyArrays: true,
        },
      },
    ])
    .toArray();

  if (!result.length) {
    return res.status(404).json({
      success: false,
      message: "Application not found.",
    });
  }

  res.json(result[0]);
};

// =====================================================
// GET FOUNDER APPLICATIONS
// GET /api/founder/applications?email=
// =====================================================

const getFounderApplications = async (req, res) => {
  const email =
    req.query.email ||
    getEmail(req);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Founder email is required.",
    });
  }

  const db = getDB();

  const applications = await db
    .collection("applications")
    .aggregate([
      {
        $match: {
          founder_email: email
            .trim()
            .toLowerCase(),
        },
      },

      {
        $lookup: {
          from: "opportunities",
          localField: "opportunity_id",
          foreignField: "_id",
          as: "opportunity_details",
        },
      },

      {
        $unwind: {
          path: "$opportunity_details",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "startups",
          localField: "startup_id",
          foreignField: "_id",
          as: "startup_details",
        },
      },

      {
        $unwind: {
          path: "$startup_details",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $sort: {
          createdAt: -1,
        },
      },
    ])
    .toArray();

  res.json(applications);
};

// =====================================================
// ACCEPT / REJECT
// PATCH /api/founder/applications/:id
// =====================================================

const updateApplicationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid application ID.",
    });
  }

  const allowedStatuses = [
    "Pending",
    "Accepted",
    "Rejected",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message:
        "Status must be Pending, Accepted or Rejected.",
    });
  }

  const db = getDB();

  const application = await db
    .collection("applications")
    .findOne({
      _id: objectId(id),
    });

  if (!application) {
    return res.status(404).json({
      success: false,
      message: "Application not found.",
    });
  }

  // ---------------------------------------------------
  // Optional founder ownership check
  // ---------------------------------------------------

  const founderEmail = getEmail(req);

  if (
    founderEmail &&
    application.founder_email &&
    founderEmail.toLowerCase() !==
      application.founder_email.toLowerCase()
  ) {
    return res.status(403).json({
      success: false,
      message: "You are not allowed to update this application.",
    });
  }

  const result = await db
    .collection("applications")
    .updateOne(
      {
        _id: objectId(id),
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

  if (!result.modifiedCount && status !== application.status) {
    return res.status(500).json({
      success: false,
      message: "Failed to update application.",
    });
  }

  // ---------------------------------------------------
  // 🟢 Send Notification to Collaborator
  // ---------------------------------------------------
  if (application.collaborator_email) {
    // Opportunity title বের করার অপশনাল কোয়েরি
    const opportunity = await db.collection("opportunities").findOne({
      _id: application.opportunity_id,
    });

    const opportunityTitle = opportunity?.title || "the opportunity";

    await db.collection("notifications").insertOne({
      recipient_email: application.collaborator_email,
      role: "collaborator",
      title: `Application ${status}`,
      message: `Your application for "${opportunityTitle}" has been ${status.toLowerCase()} by the founder.`,
      isRead: false,
      read: false,
      unread: true,
      createdAt: new Date(),
    });
  }

  res.json({
    success: true,
    message: `Application ${status.toLowerCase()} successfully.`,
    status,
  });
};

// =====================================================
// DELETE APPLICATION
// DELETE /api/applications/:id
// =====================================================

const deleteApplication = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid application ID.",
    });
  }

  const db = getDB();

  const application = await db
    .collection("applications")
    .findOne({
      _id: objectId(id),
    });

  if (!application) {
    return res.status(404).json({
      success: false,
      message: "Application not found.",
    });
  }

  if (
    application.status &&
    application.status !== "Pending"
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Accepted or rejected applications cannot be deleted.",
    });
  }

  await db
    .collection("applications")
    .deleteOne({
      _id: objectId(id),
    });

  res.json({
    success: true,
    message: "Application deleted successfully.",
  });
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createApplication,
  getMyApplications,
  getFounderApplications,
  updateApplicationStatus,
  getSingleApplication,
  deleteApplication,
};