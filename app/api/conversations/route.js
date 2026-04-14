import { NextResponse } from 'next/server';
import pool from '../../../lib/db';

export async function GET(req) {
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  const { rows } = await pool.query(
    'SELECT * FROM conversations ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return NextResponse.json(rows);
}

export async function POST(req) {
  const { id, title } = await req.json();
  await pool.query(
    'INSERT INTO conversations (id, title, created_at) VALUES ($1, $2, $3)',
    [id, title || 'New Conversation', Date.now()]
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req) {
  const { id } = await req.json();
  // Delete all messages associated with this conversation
  await pool.query('DELETE FROM messages WHERE conversation_id = $1', [id]);
  // Delete the conversation itself
  await pool.query('DELETE FROM conversations WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
}
