// server/db.js
import pkg from "pg";
const { Pool } = pkg;

// Make sure you set your DATABASE_URL in Railway or locally
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

/**
 * Run a query and get all rows
 * @param {string} text SQL query
 * @param {any[]} params Query parameters
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Run a query and return the first row (or undefined)
 * @param {string} text SQL query
 * @param {any[]} params Query parameters
 */
export const queryOne = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows[0];
};