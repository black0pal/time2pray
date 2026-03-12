import express from "express";
import cors from "cors";
import pkg from "pg";
import { registerRoutes } from "./routes.js";

const { Pool } = pkg;

const app = express();

app.use(cors());
app.use(express.json());

/*
--------------------------------
PostgreSQL Connection
--------------------------------
Railway provides DATABASE_URL automatically
*/

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/*
--------------------------------
Test DB Connection on startup
--------------------------------
*/

async function testDB() {
  try {
    const client = await pool.connect();
    console.log("PostgreSQL connected");
    client.release();
  } catch (err) {
    console.error("Database connection failed", err);
  }
}

testDB();

/*
--------------------------------
Basic Routes
--------------------------------
*/

app.get("/", (req, res) => {
  res.send("Time2Pray API running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/*
--------------------------------
Example Database Route
--------------------------------
*/

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "Database connected",
      time: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Database query failed",
    });
  }
});

/*
--------------------------------
Start Server
--------------------------------
*/

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});