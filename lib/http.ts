import { NextResponse } from "next/server";
import { currentUser, type User } from "@/lib/auth";

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export async function requireUser(): Promise<User | NextResponse> {
  const user = await currentUser();
  return user ?? errorResponse("Please sign in to continue.", 401);
}
export function isResponse(value: User | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
export async function jsonBody(request: Request) {
  try { return await request.json(); } catch { throw new Error("Request body must be valid JSON."); }
}
