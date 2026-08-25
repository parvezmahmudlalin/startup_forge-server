const dns = require("node:dns");

// MongoDB DNS সমস্যা সমাধান (Google DNS)
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// =========================
// MIDDLEWARE
// =========================

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  })
);

app.use(express.json());

// =========================
// MONGODB CLIENT SETUP
// =========================

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
    // CONNECT TO MONGODB
    await client.connect();
    console.log("✅ Successfully connected to MongoDB!");

    const db = client.db("startup_forge");

    const userCollection = db.collection("user");
    const startupsCollection = db.collection("startup");
    const opportunitiesCollection = db.collection("opportunities");
    const applicationsCollection = db.collection("applications");

    // =========================
    // ROOT ROUTE
    // =========================

    app.get("/", (req, res) => {
      res.status(200).send("Startup Forge Server is Running!");
    });

    // =========================
    // DASHBOARD OVERVIEW ROUTE
    // =========================

    app.get("/api/founder/overview", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email is required",
          });
        }

        // Parallel processing using Promise.all for faster response times
        const [totalOpportunities, totalApplications, acceptedMembers] =
          await Promise.all([
            opportunitiesCollection.countDocuments({ founder_email: email }),
            applicationsCollection.countDocuments({ founder_email: email }),
            applicationsCollection.countDocuments({
              founder_email: email,
              status: "Accepted",
            }),
          ]);

        return res.status(200).json({
          success: true,
          stats: {
            totalOpportunities,
            totalApplications,
            acceptedMembers,
          },
        });
      } catch (error) {
        console.error("❌ GET OVERVIEW ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch overview stats",
          error: error.message,
        });
      }
    });

    // =========================
    // STARTUP API ROUTES
    // =========================

    // GET STARTUPS BY FOUNDER EMAIL
    app.get("/api/founder/startup", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        const startups = await startupsCollection
          .find({ founder_email: email })
          .toArray();

        return res.status(200).json(startups);
      } catch (error) {
        console.error("❌ GET STARTUP ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to load startup",
          error: error.message,
        });
      }
    });

    // GET SINGLE STARTUP BY ID
    app.get("/api/founder/startup/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID format",
          });
        }

        const startup = await startupsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!startup) {
          return res.status(404).json({
            success: false,
            message: "Startup not found",
          });
        }

        return res.status(200).json(startup);
      } catch (error) {
        console.error("❌ GET SINGLE STARTUP ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to load startup details",
          error: error.message,
        });
      }
    });

    // CREATE STARTUP
    app.post("/api/founder/startup", async (req, res) => {
      try {
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
          !founder_email
        ) {
          return res.status(400).json({
            success: false,
            message: "All required fields must be provided",
          });
        }

        const startupData = {
          startup_name: startup_name.trim(),
          logo: logo || "",
          industry: industry.trim(),
          description: description.trim(),
          funding_stage,
          founder_email,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await startupsCollection.insertOne(startupData);

        return res.status(201).json({
          success: true,
          message: "Startup created successfully",
          startup: {
            _id: result.insertedId,
            ...startupData,
          },
        });
      } catch (error) {
        console.error("❌ CREATE STARTUP ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to create startup",
          error: error.message,
        });
      }
    });

    // UPDATE STARTUP
    app.put("/api/founder/startup/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const {
          startup_name,
          logo,
          industry,
          description,
          funding_stage,
          founder_email,
        } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID format",
          });
        }

        if (
          !startup_name?.trim() ||
          !industry?.trim() ||
          !description?.trim() ||
          !funding_stage ||
          !founder_email
        ) {
          return res.status(400).json({
            success: false,
            message: "All required fields must be provided",
          });
        }

        const filter = {
          _id: new ObjectId(id),
          founder_email,
        };

        const updateDoc = {
          $set: {
            startup_name: startup_name.trim(),
            logo: logo || "",
            industry: industry.trim(),
            description: description.trim(),
            funding_stage,
            updatedAt: new Date(),
          },
        };

        const result = await startupsCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Startup not found or unauthorized",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Startup updated successfully",
        });
      } catch (error) {
        console.error("❌ UPDATE STARTUP ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update startup",
          error: error.message,
        });
      }
    });

    // DELETE STARTUP
    app.delete("/api/founder/startup/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { email } = req.query;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID format",
          });
        }

        const filter = { _id: new ObjectId(id) };

        if (email) {
          filter.founder_email = email;
        }

        const result = await startupsCollection.deleteOne(filter);

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Startup not found or unauthorized",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Startup deleted successfully",
        });
      } catch (error) {
        console.error("❌ DELETE STARTUP ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to delete startup",
          error: error.message,
        });
      }
    });

    // =========================
    // USER PROFILE ROUTE
    // =========================

    app.put("/api/users/profile", async (req, res) => {
      try {
        const { email, name, image, bio, skills } = req.body;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        const result = await userCollection.updateOne(
          { email },
          {
            $set: {
              ...(name && { name: name.trim() }),
              ...(image && { image }),
              ...(bio && { bio: bio.trim() }),
              ...(skills && { skills }),
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );

        return res.status(200).json({
          success: true,
          message: "Profile updated successfully",
          result,
        });
      } catch (error) {
        console.error("❌ UPDATE PROFILE ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update profile",
          error: error.message,
        });
      }
    });

    // =========================
    // OPPORTUNITY API ROUTES
    // =========================

    // POST: CREATE NEW OPPORTUNITY
    app.post("/api/founder/opportunities", async (req, res) => {
      try {
        const {
          role_title,
          required_skills,
          work_type,
          commitment_level,
          deadline,
          founder_email,
          startup_id,
        } = req.body;

        if (
          !role_title ||
          !required_skills ||
          !work_type ||
          !commitment_level ||
          !deadline ||
          !founder_email
        ) {
          return res.status(400).json({
            success: false,
            message: "All fields are required.",
          });
        }

        const formattedSkills = Array.isArray(required_skills)
          ? required_skills
          : required_skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

        const opportunityData = {
          startup_id:
            startup_id && ObjectId.isValid(startup_id)
              ? new ObjectId(startup_id)
              : null,
          role_title: role_title.trim(),
          required_skills: formattedSkills,
          work_type,
          commitment_level,
          deadline,
          founder_email,
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await opportunitiesCollection.insertOne(opportunityData);

        return res.status(201).json({
          success: true,
          message: "Opportunity created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("❌ ADD OPPORTUNITY ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to create opportunity",
          error: error.message,
        });
      }
    });

    // GET: FETCH OPPORTUNITIES BY FOUNDER EMAIL
    app.get("/api/founder/opportunities", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email is required",
          });
        }

        const opportunities = await opportunitiesCollection
          .find({ founder_email: email })
          .sort({ createdAt: -1 })
          .toArray();

        return res.status(200).json(opportunities);
      } catch (error) {
        console.error("❌ GET OPPORTUNITIES ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch opportunities",
          error: error.message,
        });
      }
    });

    // PUT: UPDATE OPPORTUNITY
    app.put("/api/founder/opportunities/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const {
          role_title,
          required_skills,
          work_type,
          commitment_level,
          deadline,
        } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Opportunity ID format",
          });
        }

        const formattedSkills = Array.isArray(required_skills)
          ? required_skills
          : required_skills
              ?.split(",")
              .map((s) => s.trim())
              .filter(Boolean);

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role_title,
            required_skills: formattedSkills,
            work_type,
            commitment_level,
            deadline,
            updatedAt: new Date(),
          },
        };

        const result = await opportunitiesCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Opportunity not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Opportunity updated successfully",
        });
      } catch (error) {
        console.error("❌ UPDATE OPPORTUNITY ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update opportunity",
          error: error.message,
        });
      }
    });

    // DELETE: DELETE OPPORTUNITY
    app.delete("/api/founder/opportunities/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Opportunity ID format",
          });
        }

        const result = await opportunitiesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Opportunity not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Opportunity deleted successfully",
        });
      } catch (error) {
        console.error("❌ DELETE OPPORTUNITY ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to delete opportunity",
          error: error.message,
        });
      }
    });

    // =========================
    // APPLICATION API ROUTES
    // =========================

    // GET: FETCH APPLICATIONS FOR FOUNDER
    app.get("/api/founder/applications", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email is required",
          });
        }

        const applications = await applicationsCollection
          .find({ founder_email: email })
          .sort({ createdAt: -1 })
          .toArray();

        return res.status(200).json(applications);
      } catch (error) {
        console.error("❌ GET APPLICATIONS ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch applications",
          error: error.message,
        });
      }
    });

    // PATCH: ACCEPT / REJECT APPLICATION STATUS
    app.patch("/api/founder/applications/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Application ID format",
          });
        }

        if (!["Accepted", "Rejected", "Pending"].includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Invalid status value",
          });
        }

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: `Application ${status.toLowerCase()} successfully`,
        });
      } catch (error) {
        console.error("❌ UPDATE APPLICATION STATUS ERROR:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update status",
          error: error.message,
        });
      }
    });

    // HEALTH CHECK
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Pinged deployment successfully.");
  } catch (error) {
    console.error("❌ SERVER STARTUP ERROR:", error);
    process.exit(1);
  }
}

// START SERVER
run().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
});

// =========================
// GRACEFUL SHUTDOWN
// =========================

const handleShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down server gracefully...`);
  await client.close();
  process.exit(0);
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));