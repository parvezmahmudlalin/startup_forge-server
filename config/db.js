const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

let client;
let db;

const connectDB = async () => {
  if (db) return db;

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing in .env");
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();

  db = client.db("startup_forge");

  console.log("MongoDB Connected!");

  return db;
};

const getDB = () => {
  if (!db) {
    throw new Error("Database is not initialized");
  }

  return db;
};

const getClient = () => client;

const isValidId = (id) => ObjectId.isValid(id);

const objectId = (id) => new ObjectId(id);

module.exports = {
  connectDB,
  getDB,
  getClient,
  isValidId,
  objectId,
};