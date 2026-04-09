import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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