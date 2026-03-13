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
*/

app.use(
  session({
    name: "time2pray_session",
    secret: process.env.SESSION_SECRET || "time2pray-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

/*
--------------------------------
Health Routes
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
Register API Routes
--------------------------------
*/

registerRoutes(app);
console.log("Routes registered");

/*
--------------------------------
Start Server
--------------------------------
*/

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});