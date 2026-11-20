import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { row } from "@/lib/db";
import { errorResponse } from "@/lib/http";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Enter a valid email and password.");
    const user = row<{ id: string; email: string; password_hash: string }>("SELECT id,email,password_hash FROM users WHERE email=?", parsed.data.email.toLowerCase());
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) return errorResponse("Email or password is incorrect.", 401);
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch { return errorResponse("Could not sign in. Please try again.", 500); }
}
