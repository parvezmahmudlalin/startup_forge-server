require("dotenv").config();

const dns = require("node:dns");
const express = require("express");
const cors = require("cors");

const { connectDB, getClient } = require("./config/db");

// DNS
dns.setServers(["8.8.8.8", "8.8.4.4"]);

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
      process.env.CLIENT_URL,
    ].filter(Boolean),

    credentials: true,
  }),
);

app.use(express.json());

// =====================================================
// ROUTES
// =====================================================

app.use("/api", require("./routes/startup"));
app.use("/api", require("./routes/opportunity"));
app.use("/api", require("./routes/application"));
app.use("/api", require("./routes/payment"));
app.use("/api", require("./routes/notification"));
app.use("/api", require("./routes/profile"));
app.use("/api", require("./routes/founder"));

// =====================================================
// BASIC
// =====================================================

app.get("/", (req, res) => {
  res.send("Startup Forge Server is Running!");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is healthy",
  });
});

// =====================================================
// START SERVER
// =====================================================

const startServer = async () => {
  try {
    await connectDB();

    // await getClient().db("admin").command({ ping: 1 });

    console.log("MongoDB Pinged successfully.");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);

    process.exit(1);
  }
};

startServer();

// =====================================================
// SHUTDOWN
// =====================================================

const handleShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Closing MongoDB connection...`);

  try {
    const client = getClient();

    if (client) {
      await client.close();
    }

    console.log("MongoDB connection closed.");
  } catch (error) {
    console.error("Shutdown error:", error);
  }

  process.exit(0);
};

process.on("SIGINT", () => handleShutdown("SIGINT"));

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
