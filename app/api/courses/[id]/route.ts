import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ownedCourse } from "@/lib/courses";
import { rows, run } from "@/lib/db";
import { errorResponse, isResponse, requireUser } from "@/lib/http";

const schema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().max(30), description: z.string().trim().max(1000), academicLevel: z.string().trim().max(100), examDate: z.string().date().nullable(), language: z.enum(["en", "bn"]) }).partial();
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const { id } = await context.params; const course = ownedCourse(id, auth.id);
  if (!course) return errorResponse("Course not found.", 404);
  const topics = rows("SELECT * FROM topics WHERE course_id=? ORDER BY sort_order,created_at", id);
  const documents = rows("SELECT id,file_name,file_type,file_size,page_count,processing_status,created_at FROM documents WHERE course_id=? AND user_id=? ORDER BY created_at DESC", id, auth.id);
  return NextResponse.json({ course, topics, documents });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const { id } = await context.params; if (!ownedCourse(id, auth.id)) return errorResponse("Course not found.", 404);
  let body; try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON."); }
  const parsed = schema.safeParse(body); if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Check the course details.");
  const map: Record<string,string> = { name:"course_name", code:"course_code", description:"description", academicLevel:"academic_level", examDate:"exam_date", language:"preferred_language" };
  const sets: string[] = []; const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) { sets.push(`${map[key]}=?`); values.push(value); }
  if (!sets.length) return NextResponse.json({ course: ownedCourse(id, auth.id) });
  sets.push("updated_at=CURRENT_TIMESTAMP"); values.push(id, auth.id);
  run(`UPDATE courses SET ${sets.join(",")} WHERE id=? AND user_id=?`, ...values);
  return NextResponse.json({ course: ownedCourse(id, auth.id) });
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const { id } = await context.params; if (!ownedCourse(id, auth.id)) return errorResponse("Course not found.", 404);
  const docs = rows<{ storage_path:string }>("SELECT storage_path FROM documents WHERE course_id=? AND user_id=?", id, auth.id);
  run("DELETE FROM courses WHERE id=? AND user_id=?", id, auth.id);
  const base = path.resolve(process.cwd(), "data", "uploads", auth.id) + path.sep;
  for (const doc of docs) { const target = path.resolve(doc.storage_path); if (target.startsWith(base)) await rm(target, { force:true }).catch(() => {}); }
  return NextResponse.json({ ok:true });
}
