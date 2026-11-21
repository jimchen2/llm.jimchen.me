import { NextResponse } from 'next/server';
import { isTestMode } from '@/lib/testMode';

// Public on purpose: the page calls this before anything else to learn whether
// it can skip the password prompt. It reveals only the on/off flag.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ testMode: isTestMode() });
}
