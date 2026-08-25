const dns = require("node:dns");

// MongoDB DNS সমস্যা হলে Google DNS ব্যবহার করবে
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
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());

// =========================
// MONGODB
// =========================

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ MONGODB_URI is missing in .env");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// =========================
// SERVER
// =========================

async function run() {
  try {
    // =========================
    // CONNECT TO MONGODB
    // =========================

    await client.connect();

    console.log("✅ Connected to MongoDB!");

    const db = client.db("startup_forge");

    const userCollection = db.collection("user");
    const startupsCollection = db.collection("startup");
    const opportunitiesCollection = db.collection("opportunities");

    // =========================
    // ROOT ROUTE
    // =========================

    app.get("/", (req, res) => {
      res.status(200).send("Startup Forge Server is Running!");
    });

    // =========================
    // GET STARTUP BY EMAIL / ALL STARTUPS
    // =========================

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

    // =========================
    // GET SINGLE STARTUP BY ID (NEWLY ADDED TO FIX 404)
    // =========================

    app.get("/api/founder/startup/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID",
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

    // =========================
    // CREATE STARTUP
    // =========================

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

        // Required field validation
        if (
          !startup_name ||
          !industry ||
          !description ||
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

    // =========================
    // UPDATE STARTUP
    // =========================

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

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID",
          });
        }

        // Required fields
        if (
          !startup_name ||
          !industry ||
          !description ||
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
            message: "Startup not found or you are not the founder",
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

    // =========================
    // DELETE STARTUP
    // =========================

    app.delete("/api/founder/startup/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { email } = req.query;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID",
          });
        }

        const filter = {
          _id: new ObjectId(id),
        };

        // যদি email পাঠানো হয়, founder verify করবে
        if (email) {
          filter.founder_email = email;
        }

        const result = await startupsCollection.deleteOne(filter);

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Startup not found",
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
    // UPDATE USER PROFILE
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
              name,
              image,
              bio,
              skills,
              updatedAt: new Date(),
            },
          },
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
        } = req.body;

        if (
          !role_title ||
          !required_skills ||
          !work_type ||
          !commitment_level ||
          !deadline ||
          !founder_email
        ) {
          return res.status(400).send({
            success: false,
            message: "All fields are required.",
          });
        }

        const opportunityData = {
          role_title,
          required_skills,
          work_type,
          commitment_level,
          deadline,
          founder_email,
          status: "open",
          createdAt: new Date(),
        };

        const result = await opportunitiesCollection.insertOne(
          opportunityData,
        );

        res.status(201).send({
          success: true,
          message: "Opportunity created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("ADD OPPORTUNITY ERROR:", error);
        res.status(500).send({
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
          return res.status(400).send({
            success: false,
            message: "Founder email is required",
          });
        }

        const opportunities = await opportunitiesCollection
          .find({ founder_email: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(opportunities);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    await client.db("admin").command({
      ping: 1,
    });

    console.log("✅ Pinged your deployment.");
    console.log("✅ Successfully connected to MongoDB!");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ SERVER STARTUP ERROR:", error);

    // MongoDB/server connection fail হলে process বন্ধ
    process.exit(1);
  }
}

run();

// =========================
// GRACEFUL SHUTDOWN
// =========================

process.on("SIGINT", async () => {
  console.log("Shutting down server...");
  await client.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down server...");
  await client.close();
  process.exit(0);
});