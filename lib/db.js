import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Auto-initialize tables
const initDb = async () => {
  try {
    // 1. Create conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255),
        created_at BIGINT
      );
    `);

    // 2. Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        conversation_id VARCHAR(255),
        parent_id VARCHAR(255),
        role VARCHAR(50),
        content TEXT,
        created_at BIGINT
      );
    `);

    // 3. Upgrade old databases smoothly (adds column if you already ran the old code)
    await pool.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(255);
    `);
  } catch (err) {
    console.error("DB Initialization Error:", err);
  }
};

initDb();

export default pool;