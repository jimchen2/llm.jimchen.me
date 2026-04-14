import { NextResponse } from 'next/server';
import pool from '../../../lib/db';

export async function GET(req) {
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) return NextResponse.json([]);

  const { rows } = await pool.query(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return NextResponse.json(rows);
}

export async function DELETE(req) {
  const { id } = await req.json();
  
  // 1. Get the parent_id of the message being deleted
  const { rows } = await pool.query('SELECT parent_id FROM messages WHERE id = $1', [id]);
  
  if (rows.length > 0) {
    const parentId = rows[0].parent_id;
    // 2. Re-parent children: Any message replying to the deleted message now replies to its parent
    await pool.query('UPDATE messages SET parent_id = $1 WHERE parent_id = $2', [parentId, id]);
  }

  // 3. Delete only the requested message
  await pool.query('DELETE FROM messages WHERE id = $1', [id]);
  
  return NextResponse.json({ success: true });
}

export async function PUT(req) {
  const { id, content } = await req.json();
  await pool.query('UPDATE messages SET content = $1 WHERE id = $2', [content, id]);
  return NextResponse.json({ success: true });
}

export async function POST(req) {
  const { messages } = await req.json();
  if (Array.isArray(messages)) {
    for (const m of messages) {
      await pool.query(
        'INSERT INTO messages (id, conversation_id, parent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [m.id, m.conversation_id, m.parent_id, m.role, m.content, m.created_at]
      );
    }
  }
  return NextResponse.json({ success: true });
}