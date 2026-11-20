import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rows, run } from "@/lib/db";
import { errorResponse, isResponse, requireUser } from "@/lib/http";

const schema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().max(30).default(""), description: z.string().trim().max(1000).default(""), academicLevel: z.string().trim().max(100).default(""), examDate: z.string().date().nullable().optional(), language: z.enum(["en", "bn"]).default("en") });
export async function GET() {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const courses = rows(`SELECT c.*, (SELECT COUNT(*) FROM topics t WHERE t.course_id=c.id) topic_count,
    (SELECT COUNT(*) FROM documents d WHERE d.course_id=c.id) document_count,
    (SELECT COUNT(*) FROM study_tasks st JOIN study_plans sp ON sp.id=st.study_plan_id WHERE sp.course_id=c.id AND st.completion_status='completed') completed_tasks,
    (SELECT COUNT(*) FROM study_tasks st JOIN study_plans sp ON sp.id=st.study_plan_id WHERE sp.course_id=c.id) total_tasks
    FROM courses c WHERE c.user_id=? ORDER BY c.created_at DESC`, auth.id);
  return NextResponse.json({ courses });
}
export async function POST(request: Request) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  let body; try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON."); }
  const parsed = schema.safeParse(body); if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Check the course details.");
  const id = randomUUID(); const p = parsed.data;
  run("INSERT INTO courses (id,user_id,course_name,course_code,description,academic_level,exam_date,preferred_language) VALUES (?,?,?,?,?,?,?,?)", id, auth.id, p.name, p.code, p.description, p.academicLevel, p.examDate ?? null, p.language);
  return NextResponse.json({ course: { id, ...p } }, { status: 201 });
}
