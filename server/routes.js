import bcrypt from "bcrypt";
import fetch from "node-fetch";
import { query, queryOne } from "./db.js";

/*
-------------------------------------------------------
Middleware
-------------------------------------------------------
*/

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.isSuperAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/*
-------------------------------------------------------
Register Routes
-------------------------------------------------------
*/

export function registerRoutes(app) {

console.log("Routes registered");

/*
=======================================================
AUTH ROUTES
=======================================================
*/

app.post("/api/auth/register", async (req, res) => {

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields required" });
  }

  try {

    const existing = await queryOne(
      "SELECT id FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await queryOne(
      `INSERT INTO users (name,email,password_hash)
       VALUES ($1,$2,$3)
       RETURNING id,name,email,is_super_admin`,
      [name.trim(), email.toLowerCase(), hash]
    );

    req.session.userId = user.id;
    req.session.isSuperAdmin = user.is_super_admin;

    res.json({ user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }

});


app.post("/api/auth/login", async (req, res) => {

  const { email, password } = req.body;

  try {

    const user = await queryOne(
      "SELECT * FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    req.session.userId = user.id;
    req.session.isSuperAdmin = user.is_super_admin;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isSuperAdmin: user.is_super_admin
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }

});


app.post("/api/auth/logout", (req, res) => {

  req.session.destroy(() => {
    res.json({ success: true });
  });

});


app.get("/api/auth/me", async (req, res) => {

  if (!req.session?.userId) {
    return res.json({ user: null });
  }

  const user = await queryOne(
    "SELECT id,name,email,is_super_admin FROM users WHERE id=$1",
    [req.session.userId]
  );

  if (!user) {
    return res.json({ user: null });
  }

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperAdmin: user.is_super_admin
    }
  });

});


/*
=======================================================
GOOGLE MOSQUE SEARCH
=======================================================
*/

app.get("/api/mosques/nearby", async (req, res) => {

  const { lat, lon } = req.query;

  try {

    const url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lon}` +
      `&radius=5000` +
      `&type=mosque` +
      `&key=${process.env.GOOGLE_MAPS_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    res.json(data.results);

  } catch (err) {
    console.error("Nearby mosques error:", err);
    res.status(500).json({ error: "Failed to fetch nearby mosques" });
  }

});


app.get("/api/mosques/search", async (req, res) => {

  const { q } = req.query;

  try {

    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(q + " mosque")}` +
      `&key=${process.env.GOOGLE_MAPS_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    res.json(data.results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }

});


/*
=======================================================
FAVORITES
=======================================================
*/

app.get("/api/favorites", requireAuth, async (req, res) => {

  const favorites = await query(
    "SELECT * FROM favorites WHERE user_id=$1",
    [req.session.userId]
  );

  res.json(favorites);

});


app.post("/api/favorites", requireAuth, async (req, res) => {

  const { place_id, name } = req.body;

  await query(
    `INSERT INTO favorites (user_id,place_id,name)
     VALUES ($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [req.session.userId, place_id, name]
  );

  res.json({ success: true });

});


app.delete("/api/favorites/:placeId", requireAuth, async (req, res) => {

  await query(
    "DELETE FROM favorites WHERE user_id=$1 AND place_id=$2",
    [req.session.userId, req.params.placeId]
  );

  res.json({ success: true });

});


/*
=======================================================
PUSH TOKENS
=======================================================
*/

app.post("/api/push-token", requireAuth, async (req, res) => {

  const { token } = req.body;

  await query(
    `INSERT INTO push_tokens (user_id,token)
     VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [req.session.userId, token]
  );

  res.json({ success: true });

});


/*
=======================================================
MOSQUE AUTHORITY REQUEST
=======================================================
*/

app.post("/api/authorities/register", requireAuth, async (req, res) => {

  const { place_id, mosque_name, note } = req.body;

  await query(
    `INSERT INTO mosque_authorities
     (user_id,place_id,mosque_name,note,status)
     VALUES ($1,$2,$3,$4,'pending')`,
    [req.session.userId, place_id, mosque_name, note]
  );

  res.json({ success: true });

});


/*
=======================================================
IQAMAH TIMES
=======================================================
*/

app.get("/api/iqamah/:placeId", async (req, res) => {

  const times = await queryOne(
    "SELECT * FROM iqamah_times WHERE place_id=$1",
    [req.params.placeId]
  );

  res.json(times);

});


app.post("/api/iqamah", requireAuth, async (req, res) => {

  const { place_id, fajr, dhuhr, asr, maghrib, isha } = req.body;

  await query(
    `INSERT INTO iqamah_times
     (place_id,fajr,dhuhr,asr,maghrib,isha)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (place_id)
     DO UPDATE SET
     fajr=$2,
     dhuhr=$3,
     asr=$4,
     maghrib=$5,
     isha=$6`,
    [place_id, fajr, dhuhr, asr, maghrib, isha]
  );

  res.json({ success: true });

});


/*
=======================================================
JUMMAH TIMES
=======================================================
*/

app.get("/api/jummah/:placeId", async (req, res) => {

  const times = await query(
    "SELECT * FROM jummah_times WHERE place_id=$1",
    [req.params.placeId]
  );

  res.json(times);

});


app.post("/api/jummah", requireAuth, async (req, res) => {

  const { place_id, time } = req.body;

  await query(
    `INSERT INTO jummah_times (place_id,time)
     VALUES ($1,$2)`,
    [place_id, time]
  );

  res.json({ success: true });

});


/*
=======================================================
MOSQUE SUGGESTION
=======================================================
*/

app.post("/api/mosque-request", requireAuth, async (req, res) => {

  const { name, address, city } = req.body;

  await query(
    `INSERT INTO mosque_requests
     (user_id,name,address,city)
     VALUES ($1,$2,$3,$4)`,
    [req.session.userId, name, address, city]
  );

  res.json({ success: true });

});


/*
=======================================================
ADMIN ROUTES
=======================================================
*/

app.get("/api/admin/authority-requests", requireAdmin, async (req, res) => {

  const rows = await query(
    "SELECT * FROM mosque_authorities WHERE status='pending'"
  );

  res.json(rows);

});


app.post("/api/admin/authority-approve/:id", requireAdmin, async (req, res) => {

  await query(
    "UPDATE mosque_authorities SET status='approved' WHERE id=$1",
    [req.params.id]
  );

  res.json({ success: true });

});

}