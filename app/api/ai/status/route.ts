import { NextResponse } from "next/server";
import { getAIStatus } from "@/lib/ai";
import { isResponse, requireUser } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { modelDigests: _privateLocalMetadata, ...status } = await getAIStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
