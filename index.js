const dns = require("node:dns");

// MongoDB DNS সমাধানের জন্য
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://your-production-domain.com",
    ],
    credentials: true,
  })
);

app.use(express.json());

// =====================================================
// MONGODB CLIENT
// =====================================================

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ MONGODB_URI is missing in .env file");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Successfully connected to MongoDB!");

    const db = client.db("startup_forge");

    const userCollection = db.collection("user");
    const startupsCollection = db.collection("startup");
    const opportunitiesCollection = db.collection("opportunities");
    const applicationsCollection = db.collection("applications");
    const paymentsCollection = db.collection("payments");

    // Helper Aggregation Stage for Dynamic Lookup
    const getStartupLookupStages = () => [
      {
        $addFields: {
          converted_startup_id: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$startup_id", null] },
                  { $ne: ["$startup_id", ""] },
                ],
              },
              then: {
                $cond: {
                  if: { $eq: [{ $type: "$startup_id" }, "string"] },
                  then: {
                    $cond: {
                      if: { $eq: [{ $strLenCP: "$startup_id" }, 24] },
                      then: { $toObjectId: "$startup_id" },
                      else: "$startup_id",
                    },
                  },
                  else: "$startup_id",
                },
              },
              else: null,
            },
          },
        },
      },
      // Primary Lookup ('startup')
      {
        $lookup: {
          from: "startup",
          localField: "converted_startup_id",
          foreignField: "_id",
          as: "startup_details_primary",
        },
      },
      // Fallback Lookup ('startups' in case of plural naming)
      {
        $lookup: {
          from: "startups",
          localField: "converted_startup_id",
          foreignField: "_id",
          as: "startup_details_secondary",
        },
      },
      {
        $addFields: {
          startup_details: {
            $cond: {
              if: { $gt: [{ $size: "$startup_details_primary" }, 0] },
              then: { $arrayElemAt: ["$startup_details_primary", 0] },
              else: { $arrayElemAt: ["$startup_details_secondary", 0] },
            },
          },
        },
      },
      {
        $project: {
          startup_details_primary: 0,
          startup_details_secondary: 0,
        },
      },
    ];

    // =================================================
    // PUBLIC & GENERAL ROUTES
    // =================================================

    app.get("/", (req, res) => {
      res.status(200).send("Startup Forge Server is Running!");
    });

    app.get("/api/health", (req, res) => {
      res.status(200).json({ success: true, message: "Server is healthy" });
    });

    // ১. পাবলিক অপোরচুনিটি লিস্ট
    app.get("/api/opportunities", async (req, res) => {
      try {
        const { search, workType, limit } = req.query;
        let filter = {};

        filter.$or = [
          { status: { $regex: /^open$/i } },
          { status: { $exists: false } },
        ];

        if (search) {
          filter.$and = [
            {
              $or: [
                { role_title: { $regex: search, $options: "i" } },
                { required_skills: { $regex: search, $options: "i" } },
              ],
            },
          ];
        }

        if (workType && workType !== "All") {
          filter.work_type = workType;
        }

        const pipeline = [
          { $match: filter },
          ...getStartupLookupStages(),
          { $sort: { createdAt: -1 } },
        ];

        if (limit) {
          pipeline.push({ $limit: parseInt(limit) });
        }

        const result = await opportunitiesCollection.aggregate(pipeline).toArray();
        return res.status(200).json(result);
      } catch (error) {
        console.error("❌ GET PUBLIC OPPORTUNITIES ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // ২. পাবলিক সিঙ্গেল অপোরচুনিটি ডিটেইলস
    app.get("/api/opportunities/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid ID format" });
        }

        const opportunity = await opportunitiesCollection
          .aggregate([
            { $match: { _id: new ObjectId(id) } },
            ...getStartupLookupStages(),
          ])
          .toArray();

        if (!opportunity.length) {
          return res.status(404).json({ success: false, message: "Opportunity not found" });
        }

        return res.status(200).json(opportunity[0]);
      } catch (error) {
        console.error("❌ GET SINGLE OPPORTUNITY ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // =================================================
    // APPLICANT / USER APPLIED ROUTES
    // =================================================

    app.post("/api/applications", async (req, res) => {
      try {
        const {
          opportunity_id,
          applicant_email,
          applicant_name,
          resume_link,
          cover_letter,
          founder_email,
        } = req.body;

        if (!opportunity_id || !applicant_email || !resume_link) {
          return res.status(400).json({
            success: false,
            message: "Opportunity ID, Email, and Resume Link are required.",
          });
        }

        if (!ObjectId.isValid(opportunity_id)) {
          return res.status(400).json({ success: false, message: "Invalid Opportunity ID format" });
        }

        const appOppId = new ObjectId(opportunity_id);

        const existingApp = await applicationsCollection.findOne({
          opportunity_id: appOppId,
          applicant_email: applicant_email.trim(),
        });

        if (existingApp) {
          return res.status(400).json({
            success: false,
            message: "You have already applied for this opportunity.",
          });
        }

        const applicationData = {
          opportunity_id: appOppId,
          applicant_email: applicant_email.trim(),
          applicant_name: applicant_name ? applicant_name.trim() : "",
          resume_link: resume_link.trim(),
          cover_letter: cover_letter ? cover_letter.trim() : "",
          founder_email: founder_email ? founder_email.trim() : "",
          status: "Pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await applicationsCollection.insertOne(applicationData);

        return res.status(201).json({
          success: true,
          message: "Application submitted successfully!",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("❌ APPLICATION SUBMIT ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/my-applications", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).json({ success: false, message: "Email required" });
        }

        const myApps = await applicationsCollection
          .aggregate([
            { $match: { applicant_email: email.trim() } },
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
              $addFields: {
                "opportunity_details.startup_id": {
                  $cond: {
                    if: {
                      $and: [
                        { $ne: ["$opportunity_details.startup_id", null] },
                        { $ne: ["$opportunity_details.startup_id", ""] },
                      ],
                    },
                    then: {
                      $cond: {
                        if: { $eq: [{ $type: "$opportunity_details.startup_id" }, "string"] },
                        then: { $toObjectId: "$opportunity_details.startup_id" },
                        else: "$opportunity_details.startup_id",
                      },
                    },
                    else: null,
                  },
                },
              },
            },
            {
              $lookup: {
                from: "startup",
                localField: "opportunity_details.startup_id",
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
            { $sort: { createdAt: -1 } },
          ])
          .toArray();

        return res.status(200).json(myApps);
      } catch (error) {
        console.error("❌ GET MY APPLICATIONS ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.delete("/api/applications/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Application ID" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await applicationsCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          return res.status(200).json({
            success: true,
            message: "Application deleted successfully",
          });
        } else {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }
      } catch (error) {
        console.error("❌ DELETE APPLICATION ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // =================================================
    // FOUNDER DASHBOARD & OTHER ROUTES
    // =================================================
    app.get("/api/founder/overview", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ success: false, message: "Founder email required" });

        const [totalOpportunities, totalApplications, acceptedMembers] = await Promise.all([
          opportunitiesCollection.countDocuments({ founder_email: email }),
          applicationsCollection.countDocuments({ founder_email: email }),
          applicationsCollection.countDocuments({ founder_email: email, status: "Accepted" }),
        ]);

        return res.status(200).json({
          success: true,
          stats: { totalOpportunities, totalApplications, acceptedMembers },
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post("/api/founder/opportunities", async (req, res) => {
      try {
        const { role_title, required_skills, work_type, commitment_level, deadline, founder_email, startup_id } = req.body;

        const opportunityData = {
          startup_id: startup_id && ObjectId.isValid(startup_id) ? new ObjectId(startup_id) : startup_id,
          role_title: String(role_title).trim(),
          required_skills: Array.isArray(required_skills) ? required_skills : String(required_skills).split(",").map(s => s.trim()),
          work_type,
          commitment_level,
          deadline,
          founder_email,
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await opportunitiesCollection.insertOne(opportunityData);
        return res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ Pinged deployment successfully.");
  } catch (error) {
    console.error("❌ SERVER STARTUP ERROR:", error);
    process.exit(1);
  }
}

run().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});