import { NextResponse } from "next/server";
import { rows } from "@/lib/db";
import { isResponse, requireUser } from "@/lib/http";
export async function GET(){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const quizzes=rows(`SELECT q.id,q.course_id,q.title,q.topic_id,q.difficulty,q.total_questions,q.language,q.created_at,c.course_name,t.topic_name,
    a.score AS latest_score,a.correct_answers AS latest_correct,a.completed_at AS last_attempt
    FROM quizzes q JOIN courses c ON c.id=q.course_id LEFT JOIN topics t ON t.id=q.topic_id
    LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.user_id=q.user_id WHERE q.user_id=? ORDER BY q.created_at DESC`,auth.id);
  return NextResponse.json({quizzes});
}
