import pkg from "pg";

const { Pool } = pkg;

/*
--------------------------------
Create PostgreSQL Pool
--------------------------------
Railway provides DATABASE_URL
--------------------------------
*/

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/*
--------------------------------
Test Database Connection
--------------------------------
*/

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("PostgreSQL connected");
    client.release();
  } catch (err) {
    console.error("Database connection failed", err);
  }
}

testConnection();

/*
--------------------------------
Query helpers
--------------------------------
*/

export async function query(text, params = []) {
  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (err) {
    console.error("Query error:", err);
    throw err;
  }
}

export async function queryOne(text, params = []) {
  try {
    const result = await pool.query(text, params);
    return result.rows[0];
  } catch (err) {
    console.error("QueryOne error:", err);
    throw err;
  }
}

/*
--------------------------------
Export pool if needed later
--------------------------------
*/

export { pool };