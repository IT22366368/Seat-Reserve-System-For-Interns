// dbInit.js
const fs = require("fs");
const path = require("path");
const { pool } = require("./config/database");

async function initDb() {
  try {
    // Read your schema file
    const sql = fs.readFileSync(
      path.join(__dirname, "database", "schema.sql"),
      "utf8"
    );

    // Execute all SQL statements
    await pool.query(sql);

    console.log("✅ Database initialized successfully");
  } catch (err) {
    console.error("❌ Failed to initialize database:", err);
  } finally {
    await pool.end();
  }
}

// Run the init function
initDb();
