// server/index.js
import express from "express";
import cors from "cors";
import pkg from "pg";
import session from "express-session";
import { registerRoutes } from "./routes.js";

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 8080;

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "super-secret", // put your secret
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }, // set true if using https
}));

// ─── POSTGRESQL CONNECTION ────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Test DB connection
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

// ─── BASIC ROUTES ───────────────────────────────────────────
app.get("/", (req, res) => res.send("Time2Pray API running"));
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/db-test", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ message: "Database connected", time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ─── REGISTER ALL API ROUTES ────────────────────────────────
registerRoutes(app, pool)
  .then(() => console.log("Routes registered"))
  .catch(err => console.error("Failed to register routes:", err));

// ─── START SERVER ───────────────────────────────────────────
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));