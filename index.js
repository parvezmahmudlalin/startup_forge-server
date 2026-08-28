const dns = require("node:dns");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// 1. Load environment variables at the very top
dotenv.config();

// 2. Custom DNS configuration for MongoDB Atlas SRV lookup issue fix
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// 3. Environment Variable Validations
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is missing in your .env file!");
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing in .env file!");
  process.exit(1);
}

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
// MONGODB CLIENT SETUP
// =====================================================

const client = new MongoClient(process.env.MONGODB_URI, {
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

    // Helper: Dynamic Startup Lookup Pipeline
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
      {
        $lookup: {
          from: "startup",
          localField: "converted_startup_id",
          foreignField: "_id",
          as: "startup_details_primary",
        },
      },
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

    // Public Opportunities List
    app.get("/api/opportunities", async (req, res) => {
      try {
        const { search, workType, limit } = req.query;
        let filter = {
          $or: [
            { status: { $regex: /^open$/i } },
            { status: { $exists: false } },
          ],
        };

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
          pipeline.push({ $limit: parseInt(limit, 10) });
        }

        const result = await opportunitiesCollection
          .aggregate(pipeline)
          .toArray();
        return res.status(200).json(result);
      } catch (error) {
        console.error("❌ GET PUBLIC OPPORTUNITIES ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // Public Single Opportunity Details
    app.get("/api/opportunities/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid ID format" });
        }

        const opportunity = await opportunitiesCollection
          .aggregate([
            { $match: { _id: new ObjectId(id) } },
            ...getStartupLookupStages(),
          ])
          .toArray();

        if (!opportunity.length) {
          return res
            .status(404)
            .json({ success: false, message: "Opportunity not found" });
        }

        return res.status(200).json(opportunity[0]);
      } catch (error) {
        console.error("❌ GET SINGLE OPPORTUNITY ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // =================================================
    // PAYMENT ROUTES (STRIPE)
    // =================================================

    app.post("/api/payment/create-checkout-session", async (req, res) => {
      try {
        const { email } = req.body;

        if (!email || typeof email !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "Valid Email is required" });
        }

        const userOpportunitiesCount =
          await opportunitiesCollection.countDocuments({
            founder_email: email.trim(),
          });

        if (userOpportunitiesCount < 3) {
          return res.status(200).json({
            requiresPayment: false,
            message: "Free limit available",
          });
        }

        const origin = req.headers.origin || "http://localhost:3000";

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Opportunity Post Fee",
                  description:
                    "Posting limit exceeded (Free limit: 3). Pay to post extra opportunity.",
                },
                unit_amount: 1000, // $10.00 USD
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          customer_email: email.trim(),
          success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/dashboard/founder/post-opportunity?canceled=true`,
        });

        return res.status(200).json({
          requiresPayment: true,
          checkoutUrl: session.url,
        });
      } catch (error) {
        console.error("❌ CREATE CHECKOUT SESSION ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/payment/verify-session", async (req, res) => {
      try {
        const { session_id } = req.query;

        if (!session_id) {
          return res
            .status(400)
            .json({ success: false, message: "Session ID required" });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === "paid") {
          let existingPayment = await paymentsCollection.findOne({
            transactionId: session.id,
          });

          if (!existingPayment) {
            const newPayment = {
              transactionId: session.id,
              email: session.customer_email,
              amount: session.amount_total / 100,
              currency: session.currency,
              status: "completed",
              createdAt: new Date(),
            };
            await paymentsCollection.insertOne(newPayment);
            existingPayment = newPayment;
          }

          return res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            payment: {
              user_email: session.customer_email || existingPayment.email,
              amount: session.amount_total / 100 || existingPayment.amount,
              transaction_id: session.id,
              payment_status: "Completed",
            },
          });
        }

        return res
          .status(400)
          .json({ success: false, message: "Payment incomplete" });
      } catch (error) {
        console.error("❌ VERIFY PAYMENT ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // =================================================
    // APPLICANT / COLLABORATOR ROUTES
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
          return res
            .status(400)
            .json({ success: false, message: "Invalid Opportunity ID format" });
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
        if (!email || typeof email !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "Valid Email is required" });
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
                        if: {
                          $eq: [
                            { $type: "$opportunity_details.startup_id" },
                            "string",
                          ],
                        },
                        then: {
                          $toObjectId: "$opportunity_details.startup_id",
                        },
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
          return res
            .status(400)
            .json({ success: false, message: "Invalid Application ID" });
        }

        const result = await applicationsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          return res.status(200).json({
            success: true,
            message: "Application deleted successfully",
          });
        }
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      } catch (error) {
        console.error("❌ DELETE APPLICATION ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // =================================================
    // USER PROFILE ROUTES
    // =================================================

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
          { email: email.trim() },
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

    // =================================================
    // FOUNDER DASHBOARD & MANAGEMENT ROUTES
    // =================================================

    app.get("/api/founder/overview", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email || typeof email !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "Founder email required" });
        }

        const cleanEmail = email.trim();

        const [totalOpportunities, totalApplications, acceptedMembers] =
          await Promise.all([
            opportunitiesCollection.countDocuments({
              founder_email: cleanEmail,
            }),
            applicationsCollection.countDocuments({
              founder_email: cleanEmail,
            }),
            applicationsCollection.countDocuments({
              founder_email: cleanEmail,
              status: "Accepted",
            }),
          ]);

        return res.status(200).json({
          success: true,
          stats: { totalOpportunities, totalApplications, acceptedMembers },
        });
      } catch (error) {
        console.error("❌ GET OVERVIEW ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/founder/startup", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email || typeof email !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "Email is required" });
        }

        const startups = await startupsCollection
          .find({ founder_email: email.trim() })
          .toArray();
        return res.status(200).json(startups);
      } catch (error) {
        console.error("❌ GET STARTUP ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/founder/startup/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid startup ID format" });
        }

        const startup = await startupsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!startup) {
          return res
            .status(404)
            .json({ success: false, message: "Startup not found" });
        }

        return res.status(200).json(startup);
      } catch (error) {
        console.error("❌ GET SINGLE STARTUP ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

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
          founder_email: founder_email.trim(),
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await startupsCollection.insertOne(startupData);
        return res.status(201).json({
          success: true,
          message: "Startup created successfully",
          startup: { _id: result.insertedId, ...startupData },
        });
      } catch (error) {
        console.error("❌ CREATE STARTUP ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

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
          return res
            .status(400)
            .json({ success: false, message: "Invalid startup ID format" });
        }

        if (!founder_email) {
          return res
            .status(400)
            .json({ success: false, message: "Founder Email is required" });
        }

        const filter = {
          _id: new ObjectId(id),
          founder_email: founder_email.trim(),
        };
        const updateDoc = {
          $set: {
            startup_name: startup_name?.trim(),
            logo: logo || "",
            industry: industry?.trim(),
            description: description?.trim(),
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

        return res
          .status(200)
          .json({ success: true, message: "Startup updated successfully" });
      } catch (error) {
        console.error("❌ UPDATE STARTUP ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.delete("/api/founder/startup/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { email } = req.query;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid startup ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        if (email && typeof email === "string") {
          filter.founder_email = email.trim();
        }

        const result = await startupsCollection.deleteOne(filter);
        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Startup not found or unauthorized",
          });
        }

        return res
          .status(200)
          .json({ success: true, message: "Startup deleted successfully" });
      } catch (error) {
        console.error("❌ DELETE STARTUP ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/founder/opportunities", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email || typeof email !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "Founder email required" });
        }

        const result = await opportunitiesCollection
          .aggregate([
            { $match: { founder_email: email.trim() } },
            ...getStartupLookupStages(),
            { $sort: { createdAt: -1 } },
          ])
          .toArray();

        return res.status(200).json(result);
      } catch (error) {
        console.error("❌ GET FOUNDER OPPORTUNITIES ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post("/api/founder/opportunities", async (req, res) => {
      try {
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

        if (!role_title || !founder_email) {
          return res.status(400).json({
            success: false,
            message: "Role title and Founder Email are required.",
          });
        }

        let skillsArray = [];
        if (Array.isArray(required_skills)) {
          skillsArray = required_skills;
        } else if (typeof required_skills === "string") {
          skillsArray = required_skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }

        const opportunityData = {
          startup_id:
            startup_id && ObjectId.isValid(startup_id)
              ? new ObjectId(startup_id)
              : startup_id,
          role_title: String(role_title).trim(),
          description: description ? String(description).trim() : "",
          location: location ? String(location).trim() : "Remote",
          category: category ? String(category).trim() : "General",
          required_skills: skillsArray,
          work_type: work_type || "Remote",
          commitment_level: commitment_level || "Full-time",
          deadline: deadline || null,
          founder_email: String(founder_email).trim(),
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await opportunitiesCollection.insertOne(
          opportunityData
        );
        return res.status(201).json({
          success: true,
          message: "Opportunity created successfully!",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("❌ POST FOUNDER OPPORTUNITY ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

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
          return res
            .status(400)
            .json({ success: false, message: "Invalid Opportunity ID format" });
        }

        let formattedSkills = [];
        if (Array.isArray(required_skills)) {
          formattedSkills = required_skills;
        } else if (typeof required_skills === "string") {
          formattedSkills = required_skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }

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

        const result = await opportunitiesCollection.updateOne(
          filter,
          updateDoc
        );
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Opportunity not found" });
        }

        return res
          .status(200)
          .json({ success: true, message: "Opportunity updated successfully" });
      } catch (error) {
        console.error("❌ UPDATE OPPORTUNITY ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.delete("/api/founder/opportunities/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid Opportunity ID format" });
        }

        const result = await opportunitiesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Opportunity not found" });
        }

        return res
          .status(200)
          .json({ success: true, message: "Opportunity deleted successfully" });
      } catch (error) {
        console.error("❌ DELETE OPPORTUNITY ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/founder/applications", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email || typeof email !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "Founder email is required" });
        }

        const applications = await applicationsCollection
          .find({ founder_email: email.trim() })
          .sort({ createdAt: -1 })
          .toArray();

        return res.status(200).json(applications);
      } catch (error) {
        console.error("❌ GET APPLICATIONS ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.patch("/api/founder/applications/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid Application ID format" });
        }

        if (!["Accepted", "Rejected", "Pending"].includes(status)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid status value" });
        }

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Application not found" });
        }

        return res.status(200).json({
          success: true,
          message: `Application ${status.toLowerCase()} successfully`,
        });
      } catch (error) {
        console.error("❌ UPDATE APPLICATION STATUS ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    // Ping health check
    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB Pinged deployment successfully.");

    // Start Express listener after DB initialization completes
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ SERVER STARTUP ERROR:", error);
    process.exit(1);
  }
}

// Execute application initialization
run();

// Graceful Shutdown Handler
const handleShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  try {
    await client.close();
    console.log("MongoDB connection closed.");
  } catch (err) {
    console.error("Error during MongoDB disconnect:", err);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));