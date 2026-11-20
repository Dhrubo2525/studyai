import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, row, rows, run } from "@/lib/db";
import { errorResponse,isResponse,requireUser } from "@/lib/http";

const schema=z.object({answers:z.record(z.string(),z.string().max(300)),timeSpent:z.number().int().min(0).max(7200).default(0)});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const {id}=await context.params;
  const quiz=row<any>("SELECT * FROM quizzes WHERE id=? AND user_id=?",id,auth.id);if(!quiz)return errorResponse("Quiz not found.",404);
  if(row("SELECT id FROM quiz_attempts WHERE quiz_id=? AND user_id=?",id,auth.id))return errorResponse("This quiz has already been submitted.",409);
  let body:any;try{body=await request.json();}catch{return errorResponse("Request body must be valid JSON.");}
  const parsed=schema.safeParse(body);if(!parsed.success)return errorResponse(parsed.error.issues[0]?.message||"Check your answers.");
  const questions=rows<any>("SELECT id,topic_id,correct_answer,explanation FROM quiz_questions WHERE quiz_id=?",id);
  if(Object.keys(parsed.data.answers).some(questionId=>!questions.some(q=>q.id===questionId)))return errorResponse("An answer does not belong to this quiz.",403);
  const checked=questions.map(q=>({questionId:q.id,topicId:q.topic_id,selected:parsed.data.answers[q.id]??"",correct:(parsed.data.answers[q.id]??"").trim()===q.correct_answer.trim(),explanation:q.explanation}));
  const correct=checked.filter(a=>a.correct).length;const score=Math.round(correct/questions.length*100);const attemptId=randomUUID();
  try{
    db.exec("BEGIN IMMEDIATE");
    run("INSERT INTO quiz_attempts (id,user_id,quiz_id,score,total_questions,correct_answers,time_spent) VALUES (?,?,?,?,?,?,?)",attemptId,auth.id,id,score,questions.length,correct,parsed.data.timeSpent);
    for(const a of checked)run("INSERT INTO quiz_answers (id,attempt_id,question_id,selected_answer,is_correct) VALUES (?,?,?,?,?)",randomUUID(),attemptId,a.questionId,a.selected,a.correct?1:0);
    const topics=[...new Set(checked.map(a=>a.topicId).filter(Boolean))] as string[];
    for(const topicId of topics){
      const agg=row<{n:number;correct:number;attempts:number}>(`SELECT COUNT(*) n,SUM(CASE WHEN qa.is_correct=1 THEN 1 ELSE 0 END) correct,COUNT(DISTINCT a.id) attempts FROM quiz_answers qa JOIN quiz_questions qq ON qq.id=qa.question_id JOIN quiz_attempts a ON a.id=qa.attempt_id WHERE qq.topic_id=? AND a.user_id=?`,topicId,auth.id)!;
      const mastery=Math.round((agg.correct/agg.n)*100);const status=agg.n<5||agg.attempts<2?"not_enough_data":mastery>=80?"mastered":mastery>=60?"developing":"needs_improvement";
      run(`INSERT INTO topic_mastery (id,user_id,course_id,topic_id,mastery_score,mastery_status,assessed_question_count,last_assessed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,topic_id) DO UPDATE SET mastery_score=excluded.mastery_score,mastery_status=excluded.mastery_status,assessed_question_count=excluded.assessed_question_count,last_assessed_at=excluded.last_assessed_at,updated_at=CURRENT_TIMESTAMP`,randomUUID(),auth.id,quiz.course_id,topicId,mastery,status,agg.n,new Date().toISOString());
    }
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");return errorResponse("Could not save this quiz attempt. Please retry.",500);}
  return NextResponse.json({attemptId,score,correctAnswers:correct,totalQuestions:questions.length,percentage:score,answers:checked.map(a=>({questionId:a.questionId,selectedAnswer:a.selected,isCorrect:a.correct,explanation:a.explanation})),weakTopics:checked.filter(a=>!a.correct&&a.topicId).map(a=>a.topicId)},{status:201});
}
