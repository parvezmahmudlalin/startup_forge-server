const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

const connectDB = async () => {
  if (db) return db;
  await client.connect();
  console.log("✅ MongoDB Connected!");
  db = client.db("startup_forge");
  return db;
};

const getDB = () => {
  if (!db) throw new Error("Database not initialized");
  return db;
};

const isValidId = (id) => ObjectId.isValid(id);
const objectId = (id) => new ObjectId(id);

module.exports = { connectDB, getDB, client, isValidId, objectId };