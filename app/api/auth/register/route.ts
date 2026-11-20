import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { row, run } from "@/lib/db";
import { errorResponse } from "@/lib/http";

const schema = z.object({ fullName: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254), password: z.string().min(10).max(128), language: z.enum(["en","bn"]).default("en") });
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Check the registration details.");
    const { fullName, password, language } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    if (row("SELECT id FROM users WHERE email=?", email)) return errorResponse("An account with this email already exists.", 409);
    const id = randomUUID();
    run("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, email, hashPassword(password));
    run("INSERT INTO profiles (user_id,full_name,preferred_language) VALUES (?,?,?)", id, fullName, language);
    await createSession(id);
    return NextResponse.json({ user: { id, email, fullName } }, { status: 201 });
  } catch { return errorResponse("Could not create the account. Please try again.", 500); }
}
