const dns = require("node:dns");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { connectDB, client } = require("./config/db");

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173", process.env.CLIENT_URL].filter(Boolean),
    credentials: true,
  })
);
app.use(express.json());

// Load Routes
app.use("/api", require("./routes/startup"));
app.use("/api", require("./routes/opportunity"));
app.use("/api", require("./routes/application"));
app.use("/api", require("./routes/payment"));

app.get("/", (req, res) => res.send("Startup Forge Server Running"));

// Start Server
connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});

// Shutdown Handler
process.on("SIGINT", async () => {
  await client.close();
  process.exit(0);
});