import { NextResponse } from "next/server";
import { row, rows } from "@/lib/db";
import { errorResponse,isResponse,requireUser } from "@/lib/http";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const {id}=await context.params;
  const quiz=row<any>("SELECT q.id,q.course_id,q.title,q.topic_id,q.difficulty,q.total_questions,q.language,q.created_at,c.course_name,t.topic_name FROM quizzes q JOIN courses c ON c.id=q.course_id LEFT JOIN topics t ON t.id=q.topic_id WHERE q.id=? AND q.user_id=?",id,auth.id);
  if(!quiz)return errorResponse("Quiz not found.",404);
  const attempt=row("SELECT id,score,correct_answers,total_questions,completed_at FROM quiz_attempts WHERE quiz_id=? AND user_id=?",id,auth.id);
  const questions=rows<any>("SELECT id,question_text,question_type,options FROM quiz_questions WHERE quiz_id=? ORDER BY rowid",id).map(q=>({...q,options:JSON.parse(q.options)}));
  return NextResponse.json({quiz,questions,attempt});
}
