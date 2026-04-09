import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Auto-initialize table
pool.query(`
  CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(255) PRIMARY KEY,
    parent_id VARCHAR(255),
    role VARCHAR(50),
    content TEXT,
    created_at BIGINT
  );
`).catch(console.error);

export default pool;