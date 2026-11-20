import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { row } from "@/lib/db";
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });
  const profile = row("SELECT full_name,preferred_language,preferred_theme,daily_study_hours,available_weekdays FROM profiles WHERE user_id=?", user.id);
  return NextResponse.json({ user, profile });
}
