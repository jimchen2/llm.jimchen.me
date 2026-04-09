import { NextResponse } from 'next/server';
import pool from '../../../lib/db';

export async function GET() {
  const { rows } = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
  return NextResponse.json(rows);
}

export async function DELETE(req) {
  const { id } = await req.json();
  // Using a recursive CTE to delete the message and all its children (branches)
  await pool.query(`
    WITH RECURSIVE del_tree AS (
      SELECT id FROM messages WHERE id = $1
      UNION ALL
      SELECT m.id FROM messages m INNER JOIN del_tree dt ON m.parent_id = dt.id
    )
    DELETE FROM messages WHERE id IN (SELECT id FROM del_tree);
  `, [id]);
  return NextResponse.json({ success: true });
}