// app/api/grammar/route.js
// Backend for the /grammar page. Same calling pattern as the chat frontend:
// the browser sends the shared frontend secret (x-db-token), we verify it
// against APP_PASSWORD, then call the model via the same lib/llm.js helper.
// Nothing is saved to Redis/PSQL — grammar checks are ephemeral.
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { GRAMMAR_SYSTEM_PROMPT } from "@/lib/grammar";

const MAX_TEXT_CHARS = 30000;

function isAuthorized(request) {
  const token = request.headers.get("x-db-token");
  const validToken = process.env.APP_PASSWORD || "your-default-password";
  return Boolean(token) && token === validToken;
}

// The model occasionally wraps the answer in a code fence — strip it.
function cleanOutput(raw) {
  let t = (raw || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }
  return t;
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, context = "", model } = body;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: "text too long" }, { status: 413 });
  }

  // The new chunk is sent as <text>; the already-checked tail of the document
  // (for agreement/context) is sent as <context> and must not be echoed back.
  const parts = [];
  if (context && String(context).trim()) {
    parts.push(`<context>\n${String(context).slice(-1500)}\n</context>`);
  }
  parts.push(`<text>\n${text}\n</text>`);

  let corrected = "";
  let error = null;

  await callLLM({
    model: model || process.env.DEFAULT_MODEL || "gemini-3.8-flash",
    messages: [
      { role: "system", content: GRAMMAR_SYSTEM_PROMPT },
      { role: "user", content: parts.join("\n\n") },
    ],
    onChunk: async (chunk) => {
      corrected += chunk;
    },
    onDone: async () => {},
    onError: async (err) => {
      error = err;
    },
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || "LLM request failed" },
      { status: 502 }
    );
  }

  return NextResponse.json({ corrected: cleanOutput(corrected) });
}
