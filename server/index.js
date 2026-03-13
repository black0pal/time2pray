import express from "express";
import cors from "cors";
import session from "express-session";
import { registerRoutes } from "./routes.js";
import "./db.js";

const app = express();

/*
--------------------------------
CORS
--------------------------------
Allow frontend / mobile app
--------------------------------
*/

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/*
--------------------------------
Body Parsing
--------------------------------
*/

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
--------------------------------
Sessions
--------------------------------
Used for login authentication
--------------------------------
*/

app.use(
  session({
    name: "time2pray_session",
    secret: process.env.SESSION_SECRET || "time2pray-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Railway runs behind proxy
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

/*
--------------------------------
Health / root routes
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
Register all API routes
--------------------------------
*/

registerRoutes(app)
  .then(() => {
    console.log("Routes registered");
  })
  .catch((err) => {
    console.error("Route registration failed", err);
  });

/*
--------------------------------
Start server
--------------------------------
*/

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});