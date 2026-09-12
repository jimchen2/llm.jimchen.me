import { handleChatPOST } from "@/lib/chatHandler";
import { MODES } from "@/lib/config";

// Random mode API: no system prompt is applied at all.
export async function POST(req) {
  return handleChatPOST(req, MODES.RANDOM);
}
