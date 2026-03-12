// server/routes.js
import bcrypt from "bcrypt";
import { query, queryOne } from "./db.js";

// ─── MIDDLEWARE ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId || !req.session?.isSuperAdmin) return res.status(403).json({ error: "Admin access required" });
  next();
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────
async function sendPushNotifications(tokens, title, body) {
  if (!tokens.length) return;
  try {
    const messages = tokens.map(to => ({ to, title, body, sound: "default" }));
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const f1 = lat1 * Math.PI / 180;
  const f2 = lat2 * Math.PI / 180;
  const df = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── REGISTER ROUTES ────────────────────────────────────────
export async function registerRoutes(app) {

  // ─── AUTH ───────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "All fields required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    try {
      const existing = await queryOne("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
      if (existing) return res.status(409).json({ error: "Email already registered" });
      const hash = await bcrypt.hash(password, 10);
      const user = await queryOne(
        "INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email,is_super_admin",
        [name.trim(), email.toLowerCase(), hash]
      );
      req.session.userId = user.id;
      req.session.isSuperAdmin = user.is_super_admin;
      return res.json({ user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.is_super_admin } });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    try {
      const user = await queryOne("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
      if (!user) return res.status(401).json({ error: "Invalid email or password" });
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: "Invalid email or password" });
      req.session.userId = user.id;
      req.session.isSuperAdmin = user.is_super_admin;
      return res.json({ user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.is_super_admin } });
    } catch {
      return res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) return res.json({ user: null });
    try {
      const user = await queryOne("SELECT id,name,email,is_super_admin FROM users WHERE id=$1", [req.session.userId]);
      if (!user) { req.session.destroy(() => {}); return res.json({ user: null }); }
      req.session.isSuperAdmin = user.is_super_admin;
      return res.json({ user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.is_super_admin } });
    } catch {
      return res.json({ user: null });
    }
  });

  // ─── FAVORITES ─────────────────────────────────────────────
  app.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const rows = await query("SELECT * FROM user_favorites WHERE user_id=$1 ORDER BY created_at DESC", [req.session.userId]);
      return res.json({ favorites: rows });
    } catch {
      return res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/favorites", requireAuth, async (req, res) => {
    const { mosqueId, mosqueName } = req.body;
    if (!mosqueId || !mosqueName) return res.status(400).json({ error: "Mosque details required" });
    try {
      await queryOne(
        "INSERT INTO user_favorites (user_id, mosque_id, mosque_name) VALUES ($1,$2,$3) ON CONFLICT (user_id, mosque_id) DO NOTHING",
        [req.session.userId, mosqueId, mosqueName]
      );
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: "Failed" });
    }
  });

  app.delete("/api/favorites/:mosqueId", requireAuth, async (req, res) => {
    try {
      await queryOne("DELETE FROM user_favorites WHERE user_id=$1 AND mosque_id=$2", [req.session.userId, req.params.mosqueId]);
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/favorites-count", async (req, res) => {
    const { ids } = req.query;
    if (!ids) return res.json({ counts: {} });
    const idList = ids.split(",").filter(Boolean);
    if (!idList.length) return res.json({ counts: {} });
    try {
      const rows = await query("SELECT mosque_id, COUNT(*) as count FROM user_favorites WHERE mosque_id = ANY($1::text[]) GROUP BY mosque_id", [idList]);
      const counts = {};
      rows.forEach(r => { counts[r.mosque_id] = parseInt(r.count); });
      return res.json({ counts });
    } catch {
      return res.status(500).json({ error: "Failed" });
    }
  });

  // ─── PUSH TOKENS ───────────────────────────────────────────
  app.post("/api/push-token", requireAuth, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });
    try {
      await queryOne(
        "INSERT INTO push_tokens (user_id, token, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id, token) DO UPDATE SET updated_at=NOW()",
        [req.session.userId, token]
      );
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: "Failed" });
    }
  });

  // ─── AUTHORITIES ───────────────────────────────────────────
  app.post("/api/authorities/register", requireAuth, async (req, res) => {
    const { mosqueId, mosqueName, mosqueLat, mosqueLon, note } = req.body;
    if (!mosqueId || !mosqueName || mosqueLat == null || mosqueLon == null)
      return res.status(400).json({ error: "Mosque details required" });

    try {
      const existing = await queryOne("SELECT id,status FROM mosque_authorities WHERE user_id=$1 AND mosque_id=$2", [req.session.userId, mosqueId]);
      if (existing) return res.status(409).json({ error: `You already have a ${existing.status} request for this mosque` });

      const config = await queryOne("SELECT max_authorities FROM mosque_config WHERE mosque_id=$1", [mosqueId]);
      const limit = config?.max_authorities ?? 5;
      const currentCount = await queryOne("SELECT COUNT(*) as count FROM mosque_authorities WHERE mosque_id=$1 AND status='verified'", [mosqueId]);
      if (parseInt(currentCount?.count ?? 0) >= limit) return res.status(409).json({ error: `This mosque has reached its maximum of ${limit} authorized representatives` });

      const record = await queryOne(
        "INSERT INTO mosque_authorities (user_id, mosque_id, mosque_name, mosque_lat, mosque_lon, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        [req.session.userId, mosqueId, mosqueName, mosqueLat, mosqueLon, note || null]
      );
      return res.json({ authority: record });
    } catch (err) {
      console.error("Authority register:", err);
      return res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // ─── IQAMAH ───────────────────────────────────────────────
  app.get("/api/iqamah/:mosqueId", async (req, res) => {
    const { mosqueId } = req.params;
    try {
      const rows = await query("SELECT * FROM iqamah_times WHERE mosque_id=$1 ORDER BY prayer_time ASC", [mosqueId]);
      return res.json({ iqamah: rows });
    } catch {
      return res.status(500).json({ error: "Failed to fetch iqamah times" });
    }
  });

  // ─── JUMMAH ───────────────────────────────────────────────
  app.get("/api/jummah/:mosqueId", async (req, res) => {
    const { mosqueId } = req.params;
    try {
      const rows = await query("SELECT * FROM jummah_times WHERE mosque_id=$1 ORDER BY start_time ASC", [mosqueId]);
      return res.json({ jummah: rows });
    } catch {
      return res.status(500).json({ error: "Failed to fetch jummah times" });
    }
  });

  // ─── CONTACTS ─────────────────────────────────────────────
  app.get("/api/contacts/:mosqueId", async (req, res) => {
    const { mosqueId } = req.params;
    try {
      const rows = await query("SELECT * FROM mosque_contacts WHERE mosque_id=$1", [mosqueId]);
      return res.json({ contacts: rows });
    } catch {
      return res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // ─── MOSQUE REQUESTS ──────────────────────────────────────
  app.get("/api/mosque-requests", requireAuth, async (req, res) => {
    try {
      const rows = await query("SELECT * FROM mosque_requests WHERE user_id=$1 ORDER BY created_at DESC", [req.session.userId]);
      return res.json({ requests: rows });
    } catch {
      return res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  app.post("/api/mosque-requests", requireAuth, async (req, res) => {
    const { mosqueName, mosqueLat, mosqueLon, note } = req.body;
    if (!mosqueName || mosqueLat == null || mosqueLon == null) return res.status(400).json({ error: "Mosque details required" });
    try {
      const record = await queryOne(
        "INSERT INTO mosque_requests (user_id, mosque_name, mosque_lat, mosque_lon, note) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [req.session.userId, mosqueName, mosqueLat, mosqueLon, note || null]
      );
      return res.json({ request: record });
    } catch {
      return res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // ─── CUSTOM MOSQUES ───────────────────────────────────────
  app.get("/api/custom-mosques", async (req, res) => {
    try {
      const rows = await query("SELECT * FROM custom_mosques ORDER BY created_at DESC");
      return res.json({ mosques: rows });
    } catch {
      return res.status(500).json({ error: "Failed to fetch custom mosques" });
    }
  });

  // ─── GOOGLE PLACES SEARCH ────────────────────────────────
  app.get("/api/places/search", async (req, res) => {
    const { query: searchQuery } = req.query;
    if (!searchQuery) return res.status(400).json({ error: "Query required" });
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      return res.json(data);
    } catch (err) {
      console.error("Google Places search:", err);
      return res.status(500).json({ error: "Failed to search places" });
    }
  });

  // ─── NEARBY MOSQUES ───────────────────────────────────────
  app.get("/api/mosques/nearby", async (req, res) => {
    const { lat, lon, radius = 5000 } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "Latitude and longitude required" });

    try {
      const rows = await query(`
        SELECT *, 
          (6371000 * acos(
            cos(radians($1)) * cos(radians(mosque_lat)) * cos(radians(mosque_lon) - radians($2)) +
            sin(radians($1)) * sin(radians(mosque_lat))
          )) AS distance
        FROM mosques
        HAVING distance <= $3
        ORDER BY distance ASC
      `, [lat, lon, radius]);
      return res.json({ mosques: rows });
    } catch (err) {
      console.error("Nearby mosques:", err);
      return res.status(500).json({ error: "Failed to fetch nearby mosques" });
    }
  });

  // ─── DONE ────────────────────────────────────────────────
}