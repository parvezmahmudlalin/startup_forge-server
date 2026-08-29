const dns = require("node:dns");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe");

dotenv.config();

// =====================================================
// DNS
// =====================================================

dns.setServers(["8.8.8.8", "8.8.4.4"]);

// =====================================================
// ENV VALIDATION
// =====================================================

const requiredEnv = ["MONGODB_URI", "STRIPE_SECRET_KEY"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ ${key} is missing in .env`);
    process.exit(1);
  }
}

// =====================================================
// APP
// =====================================================

const app = express();
const PORT = process.env.PORT || 5000;

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      process.env.CLIENT_URL,
    ].filter(Boolean),
    credentials: true,
  }),
);

app.use(express.json());

// =====================================================
// MONGODB
// =====================================================

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// =====================================================
// HELPERS
// =====================================================

const asyncHandler = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((error) => {
    console.error("❌ API ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  });

const isValidId = (id) => ObjectId.isValid(id);

const objectId = (id) => new ObjectId(id);

const getEmail = (req) =>
  typeof (req.query.email || req.body?.email) === "string"
    ? (req.query.email || req.body.email).trim()
    : "";

const parseSkills = (skills) => {
  if (Array.isArray(skills)) return skills.map(String).map((x) => x.trim()).filter(Boolean);

  if (typeof skills === "string") {
    return skills
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
};

// =====================================================
// STARTUP LOOKUP
// =====================================================

const startupLookup = [
  {
    $set: {
      startupObjectId: {
        $convert: {
          input: "$startup_id",
          to: "objectId",
          onError: null,
          onNull: null,
        },
      },
    },
  },
  {
    $lookup: {
      from: "startup",
      localField: "startupObjectId",
      foreignField: "_id",
      as: "startupData",
    },
  },
  {
    $lookup: {
      from: "startups",
      localField: "startupObjectId",
      foreignField: "_id",
      as: "startupData2",
    },
  },
  {
    $set: {
      startup_details: {
        $ifNull: [
          { $arrayElemAt: ["$startupData", 0] },
          { $arrayElemAt: ["$startupData2", 0] },
        ],
      },
    },
  },
  {
    $project: {
      startupObjectId: 0,
      startupData: 0,
      startupData2: 0,
    },
  },
];

// =====================================================
// MAIN
// =====================================================

async function run() {
  try {
    await client.connect();

    console.log("✅ Successfully connected to MongoDB!");

    const db = client.db("startup_forge");

    const users = db.collection("user");
    const startups = db.collection("startup");
    const opportunities = db.collection("opportunities");
    const applications = db.collection("applications");
    const payments = db.collection("payments");
    const notifications = db.collection("notifications");

    // =================================================
    // BASIC
    // =================================================

    app.get("/", (req, res) => {
      res.send("Startup Forge Server is Running!");
    });

    app.get("/api/health", (req, res) => {
      res.json({
        success: true,
        message: "Server is healthy",
      });
    });

    // =================================================
    // NOTIFICATIONS (ADDED FIX)
    // =================================================

    app.get(
      "/api/notifications",
      asyncHandler(async (req, res) => {
        const email = getEmail(req);

        const query = email ? { recipient_email: email } : {};
        const result = await notifications
          .find(query)
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();

        res.json(result);
      })
    );

    // =================================================
    // PUBLIC OPPORTUNITIES
    // =================================================

    app.get(
      "/api/opportunities",
      asyncHandler(async (req, res) => {
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
          ...startupLookup,
          { $sort: { createdAt: -1 } },
        ];

        if (limit) {
          pipeline.push({ $limit: Number(limit) });
        }

        res.json(await opportunities.aggregate(pipeline).toArray());
      }),
    );

    // =================================================
    // SINGLE OPPORTUNITY
    // =================================================

    app.get(
      "/api/opportunities/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!isValidId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid ID format",
          });
        }

        const result = await opportunities
          .aggregate([
            { $match: { _id: objectId(id) } },
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
      }),
    );

    // =================================================
    // STRIPE PAYMENT
    // =================================================

    app.post(
      "/api/payment/create-checkout-session",
      asyncHandler(async (req, res) => {
        const email = req.body.email?.trim();

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Valid Email is required",
          });
        }

        const count = await opportunities.countDocuments({
          founder_email: email,
        });

        // Free limit = 3
        if (count < 3) {
          return res.json({
            requiresPayment: false,
            message: "Free limit available",
          });
        }

        const origin =
          req.headers.origin ||
          process.env.CLIENT_URL ||
          "http://localhost:3000";

        const session = await stripeClient.checkout.sessions.create({
          payment_method_types: ["card"],

          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Opportunity Post Fee",
                  description:
                    "Posting limit exceeded. Free limit is 3.",
                },
                unit_amount: 1000,
              },
              quantity: 1,
            },
          ],

          mode: "payment",
          customer_email: email,

          success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

          cancel_url: `${origin}/dashboard/founder/post-opportunity?canceled=true`,
        });

        res.json({
          requiresPayment: true,
          checkoutUrl: session.url,
        });
      }),
    );

    // =================================================
    // VERIFY PAYMENT
    // =================================================

    app.get(
      "/api/payment/verify-session",
      asyncHandler(async (req, res) => {
        const { session_id } = req.query;

        if (!session_id) {
          return res.status(400).json({
            success: false,
            message: "Session ID required",
          });
        }

        const session =
          await stripeClient.checkout.sessions.retrieve(session_id);

        if (session.payment_status !== "paid") {
          return res.status(400).json({
            success: false,
            message: "Payment incomplete",
          });
        }

        let payment = await payments.findOne({
          transactionId: session.id,
        });

        if (!payment) {
          payment = {
            transactionId: session.id,
            email: session.customer_email,
            amount: session.amount_total / 100,
            currency: session.currency,
            status: "completed",
            createdAt: new Date(),
          };

          await payments.insertOne(payment);
        }

        res.json({
          success: true,
          message: "Payment verified successfully",
          payment: {
            user_email: session.customer_email || payment.email,
            amount: session.amount_total / 100 || payment.amount,
            transaction_id: session.id,
            payment_status: "Completed",
          },
        });
      }),
    );

    // =================================================
    // APPLICATION
    // =================================================

    app.post(
      "/api/applications",
      asyncHandler(async (req, res) => {
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
            message: "Opportunity ID, Email and Resume Link are required.",
          });
        }

        if (!isValidId(opportunity_id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Opportunity ID",
          });
        }

        const email = applicant_email.trim();

        const exists = await applications.findOne({
          opportunity_id: objectId(opportunity_id),
          applicant_email: email,
        });

        if (exists) {
          return res.status(400).json({
            success: false,
            message: "You have already applied for this opportunity.",
          });
        }

        const data = {
          opportunity_id: objectId(opportunity_id),
          applicant_email: email,
          applicant_name: applicant_name?.trim() || "",
          resume_link: resume_link.trim(),
          cover_letter: cover_letter?.trim() || "",
          founder_email: founder_email?.trim() || "",
          status: "Pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await applications.insertOne(data);

        res.status(201).json({
          success: true,
          message: "Application submitted successfully!",
          insertedId: result.insertedId,
        });
      }),
    );

    // =================================================
    // MY APPLICATIONS
    // =================================================

    app.get(
      "/api/my-applications",
      asyncHandler(async (req, res) => {
        const email = getEmail(req);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Valid Email is required",
          });
        }

        const result = await applications
          .aggregate([
            { $match: { applicant_email: email } },

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
                from: "startup",
                let: {
                  startupId: "$opportunity_details.startup_id",
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: [
                          "$_id",
                          {
                            $convert: {
                              input: "$$startupId",
                              to: "objectId",
                              onError: null,
                              onNull: null,
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
                as: "startup_details",
              },
            },

            {
              $set: {
                startup_details: {
                  $arrayElemAt: ["$startup_details", 0],
                },
              },
            },

            { $sort: { createdAt: -1 } },
          ])
          .toArray();

        res.json(result);
      }),
    );

    // =================================================
    // DELETE APPLICATION
    // =================================================

    app.delete(
      "/api/applications/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!isValidId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Application ID",
          });
        }

        const result = await applications.deleteOne({
          _id: objectId(id),
        });

        if (!result.deletedCount) {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }

        res.json({
          success: true,
          message: "Application deleted successfully",
        });
      }),
    );

    // =================================================
    // PROFILE
    // =================================================

    app.put(
      "/api/users/profile",
      asyncHandler(async (req, res) => {
        const { email, name, image, bio, skills } = req.body;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        await users.updateOne(
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
          { upsert: true },
        );

        res.json({
          success: true,
          message: "Profile updated successfully",
        });
      }),
    );

    // =================================================
    // FOUNDER OVERVIEW
    // =================================================

    app.get(
      "/api/founder/overview",
      asyncHandler(async (req, res) => {
        const email = getEmail(req);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email required",
          });
        }

        const [totalOpportunities, totalApplications, acceptedMembers] =
          await Promise.all([
            opportunities.countDocuments({
              founder_email: email,
            }),

            applications.countDocuments({
              founder_email: email,
            }),

            applications.countDocuments({
              founder_email: email,
              status: "Accepted",
            }),
          ]);

        res.json({
          success: true,
          stats: {
            totalOpportunities,
            totalApplications,
            acceptedMembers,
          },
        });
      }),
    );

    // =================================================
    // FOUNDER STARTUPS
    // =================================================

    app.get(
      "/api/founder/startups",
      asyncHandler(async (req, res) => {
        const email = getEmail(req);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        const result = await startups
          .find({ founder_email: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(result);
      }),
    );

    // Keep old frontend path
    app.get(
      "/api/founder/startup",
      asyncHandler(async (req, res) => {
        const email = getEmail(req);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        res.json(
          await startups
            .find({ founder_email: email })
            .sort({ createdAt: -1 })
            .toArray(),
        );
      }),
    );

    // =================================================
    // SINGLE STARTUP
    // =================================================

    app.get(
      "/api/founder/startup/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!isValidId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID format",
          });
        }

        const startup = await startups.findOne({
          _id: objectId(id),
        });

        if (!startup) {
          return res.status(404).json({
            success: false,
            message: "Startup not found",
          });
        }

        res.json(startup);
      }),
    );

    // =================================================
    // CREATE STARTUP
    // =================================================

    app.post(
      "/api/founder/startup",
      asyncHandler(async (req, res) => {
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

        const result = await startups.insertOne(data);

        res.status(201).json({
          success: true,
          message: "Startup created successfully",
          startup: {
            _id: result.insertedId,
            ...data,
          },
        });
      }),
    );

    // =================================================
    // UPDATE STARTUP
    // =================================================

    app.put(
      "/api/founder/startup/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;
        const {
          startup_name,
          logo,
          industry,
          description,
          funding_stage,
          founder_email,
        } = req.body;

        if (!isValidId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid startup ID format",
          });
        }

        if (!founder_email) {
          return res.status(400).json({
            success: false,
            message: "Founder Email is required",
          });
        }

        const result = await startups.updateOne(
          {
            _id: objectId(id),
            founder_email: founder_email.trim(),
          },
          {
            $set: {
              startup_name: startup_name?.trim(),
              logo: logo || "",
              industry: industry?.trim(),
              description: description?.trim(),
              funding_stage,
              updatedAt: new Date(),
            },
          },
        );

        if (!result.matchedCount) {
          return res.status(404).json({
            success: false,
            message: "Startup not found or unauthorized",
          });
        }

        res.json({
          success: true,
          message: "Startup updated successfully",
        });
      }),
    );

    // =================================================
    // DELETE STARTUP
    // =================================================

    app.delete(
      "/api/founder/startup/:id",
      asyncHandler(async (req, res) => {
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

        const result = await startups.deleteOne(filter);

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
      }),
    );

    // =================================================
    // FOUNDER OPPORTUNITIES
    // =================================================

    app.get(
      "/api/founder/opportunities",
      asyncHandler(async (req, res) => {
        const email = getEmail(req);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email required",
          });
        }

        res.json(
          await opportunities
            .aggregate([
              { $match: { founder_email: email } },
              ...startupLookup,
              { $sort: { createdAt: -1 } },
            ])
            .toArray(),
        );
      }),
    );

    // =================================================
    // CREATE OPPORTUNITY
    // =================================================

    app.post(
      "/api/founder/opportunities",
      asyncHandler(async (req, res) => {
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

        const data = {
          startup_id:
            startup_id && isValidId(startup_id)
              ? objectId(startup_id)
              : startup_id,

          role_title: String(role_title).trim(),
          description: String(description || "").trim(),
          location: String(location || "Remote").trim(),
          category: String(category || "General").trim(),
          required_skills: parseSkills(required_skills),
          work_type: work_type || "Remote",
          commitment_level: commitment_level || "Full-time",
          deadline: deadline || null,
          founder_email: String(founder_email).trim(),
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await opportunities.insertOne(data);

        res.status(201).json({
          success: true,
          message: "Opportunity created successfully!",
          insertedId: result.insertedId,
        });
      }),
    );

    // =================================================
    // UPDATE OPPORTUNITY
    // =================================================

    app.put(
      "/api/founder/opportunities/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!isValidId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Opportunity ID format",
          });
        }

        const {
          role_title,
          required_skills,
          work_type,
          commitment_level,
          deadline,
        } = req.body;

        const result = await opportunities.updateOne(
          { _id: objectId(id) },
          {
            $set: {
              role_title,
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
      }),
    );

    // =================================================
    // DELETE OPPORTUNITY
    // =================================================

    app.delete(
      "/api/founder/opportunities/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!isValidId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Opportunity ID format",
          });
        }

        const result = await opportunities.deleteOne({
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
      }),
    );

    // =================================================
    // FOUNDER APPLICATIONS
    // =================================================

    app.get(
      "/api/founder/applications",
      asyncHandler(async (req, res) => {
        const email = getEmail(req);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email is required",
          });
        }

        const result = await applications
          .aggregate([
            { $match: { founder_email: email } },

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

            { $sort: { createdAt: -1 } },
          ])
          .toArray();

        res.json(result);
      }),
    );

    // =================================================
    // UPDATE APPLICATION STATUS
    // =================================================

    app.patch(
      "/api/founder/applications/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!isValidId(id)) {
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

        const result = await applications.updateOne(
          { _id: objectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        if (!result.matchedCount) {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }

        res.json({
          success: true,
          message: `Application ${status.toLowerCase()} successfully`,
        });
      }),
    );

    // =================================================
    // MONGODB PING
    // =================================================

    await client.db("admin").command({ ping: 1 });

    console.log("✅ MongoDB Pinged successfully.");
  } catch (error) {
    console.error("❌ MONGODB CONNECTION ERROR:", error);
  }
}

run();

// =====================================================
// START SERVER (Outer level to avoid blocking app)
// =====================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// =====================================================
// SHUTDOWN
// =====================================================

const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down...`);

  try {
    await client.close();
    console.log("MongoDB connection closed.");
  } catch (error) {
    console.error("Shutdown error:", error);
  }

  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));