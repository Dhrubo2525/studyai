import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { db, row, run } from "@/lib/db";
import { errorResponse, isResponse, requireUser } from "@/lib/http";

const profileSchema = z.object({ fullName: z.string().trim().min(1).max(100), educationLevel: z.string().max(100), institutionName: z.string().max(160), language: z.enum(["en", "bn"]), theme: z.enum(["dark", "light"]), dailyStudyHours: z.number().min(0.5).max(16), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7) });
export async function GET() {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const profile = row("SELECT full_name AS fullName,education_level AS educationLevel,institution_name AS institutionName,preferred_language AS language,preferred_theme AS theme,daily_study_hours AS dailyStudyHours,available_weekdays AS weekdays FROM profiles WHERE user_id=?", auth.id);
  return NextResponse.json({ user: auth, profile: profile ? { ...profile, weekdays: JSON.parse((profile as any).weekdays) } : null });
}
export async function PATCH(request: Request) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Check your profile settings.");
  const p = parsed.data;
  run("UPDATE profiles SET full_name=?,education_level=?,institution_name=?,preferred_language=?,preferred_theme=?,daily_study_hours=?,available_weekdays=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?", p.fullName, p.educationLevel, p.institutionName, p.language, p.theme, p.dailyStudyHours, JSON.stringify(p.weekdays), auth.id);
  return NextResponse.json({ profile: p });
}
export async function DELETE(request: Request) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  let body: { password?: string } = {};
  try { body = await request.json(); } catch { return errorResponse("Confirm your password to delete this account."); }
  const user = row<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=?", auth.id);
  if (!user || !body.password || !verifyPassword(body.password, user.password_hash)) return errorResponse("The password is incorrect.", 403);
  const docs = (db.prepare("SELECT storage_path FROM documents WHERE user_id=?").all(auth.id) as { storage_path: string }[]);
  for (const doc of docs) { const target = path.resolve(doc.storage_path); const base = path.resolve(process.cwd(), "data", "uploads", auth.id); if (target.startsWith(base + path.sep)) await rm(target, { force: true }).catch(() => {}); }
  run("DELETE FROM users WHERE id=?", auth.id);
  const response = NextResponse.json({ ok: true }); response.cookies.delete("learnsphere_session"); return response;
}
