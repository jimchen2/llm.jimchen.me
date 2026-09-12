import { handleChatPOST } from "@/lib/chatHandler";
import { MODES } from "@/lib/config";

// Tech mode API: the server applies TECH_SYSTEM_PROMPT (from env).
export async function POST(req) {
  return handleChatPOST(req, MODES.TECH);
}
