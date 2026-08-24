const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("startup_forge");

    const userCollection = db.collection("user");
    const startupsCollection = db.collection("startup");

    // =========================
    // GET STARTUP BY EMAIL
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

        const startup = await startupsCollection.findOne({
          founder_email: email,
        });

        res.status(200).json(startup || null);
      } catch (error) {
        console.error("GET STARTUP ERROR:", error);

        res.status(500).json({
          success: false,
          message: error.message,
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

        const existingStartup = await startupsCollection.findOne({
          founder_email,
        });

        if (existingStartup) {
          return res.status(409).json({
            success: false,
            message: "You already have a startup",
          });
        }

        const startupData = {
          startup_name,
          logo: logo || "",
          industry,
          description,
          funding_stage,
          founder_email,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await startupsCollection.insertOne(startupData);

        res.status(201).json({
          success: true,
          message: "Startup created successfully",
          startup: {
            _id: result.insertedId,
            ...startupData,
          },
        });
      } catch (error) {
        console.error("CREATE STARTUP ERROR:", error);

        res.status(500).json({
          success: false,
          message: "Failed to create startup",
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
          }
        );

        res.status(200).json({
          success: true,
          message: "Profile Updated Successfully",
          result,
        });
      } catch (error) {
        console.error("UPDATE PROFILE ERROR:", error);

        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    // MongoDB test
    await client.db("admin").command({ ping: 1 });

    console.log("Pinged your deployment.");
    console.log("Successfully connected to MongoDB!");

    // =========================
    // ROOT ROUTE
    // =========================
    app.get("/", (req, res) => {
      res.send("Startup Forge Server is Running!");
    });

    // =========================
    // START SERVER
    // =========================
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("SERVER STARTUP ERROR:", error);
  }
}

run();