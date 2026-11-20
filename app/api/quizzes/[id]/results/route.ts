import { NextResponse } from "next/server";
import { row, rows } from "@/lib/db";
import { errorResponse,isResponse,requireUser } from "@/lib/http";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const {id}=await context.params;
  const attempt=row<any>("SELECT a.* FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.quiz_id=? AND a.user_id=? AND q.user_id=?",id,auth.id,auth.id);
  if(!attempt)return errorResponse("Submit this quiz to view its results.",409);
  const quiz=row<any>("SELECT q.title,q.total_questions,c.course_name FROM quizzes q JOIN courses c ON c.id=q.course_id WHERE q.id=?",id);
  const details=rows<any>(`SELECT qq.id,qq.question_text,qq.correct_answer,qq.explanation,qq.topic_id,t.topic_name,qa.selected_answer,qa.is_correct
    FROM quiz_questions qq JOIN quiz_answers qa ON qa.question_id=qq.id JOIN quiz_attempts a ON a.id=qa.attempt_id
    LEFT JOIN topics t ON t.id=qq.topic_id WHERE a.id=? ORDER BY qq.rowid`,attempt.id);
  return NextResponse.json({attempt,quiz,answers:details});
}
