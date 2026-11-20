import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { aiErrorStatus, generateText } from "@/lib/ai";
import { row, run } from "@/lib/db";
import { localIsoDate } from "@/lib/dates";
import { errorResponse, isResponse, requireUser } from "@/lib/http";

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const body=await request.json().catch(()=>({}));const language=body?.language==="bn"?"bn":"en";
  const {id}=await context.params;
  const plan=row<any>("SELECT * FROM study_plans WHERE id=? AND user_id=?",id,auth.id);if(!plan)return errorResponse("Study plan not found.",404);
  const weak=row<any>(`SELECT t.id,t.topic_name,m.mastery_score,m.assessed_question_count FROM topic_mastery m JOIN topics t ON t.id=m.topic_id WHERE m.user_id=? AND m.course_id=? AND m.mastery_status='needs_improvement' AND m.assessed_question_count>=5 ORDER BY m.mastery_score ASC LIMIT 1`,auth.id,plan.course_id);
  if(!weak)return errorResponse("No topic has enough recent quiz responses to recommend an adjustment yet. Complete a quiz with at least five questions first.",422);
  const duration=Math.min(45,plan.daily_available_minutes);
  const dates=JSON.parse(plan.available_weekdays) as number[];
  const base=new Date();base.setHours(0,0,0,0);
  for(let i=0;i<60;i++){
    const day=new Date(base);day.setDate(day.getDate()+i);const date=localIsoDate(day);
    if(day.getTime()>new Date(`${plan.exam_date}T23:59:59`).getTime()||!dates.includes(day.getDay()))continue;
    const load=row<{total:number}>("SELECT COALESCE(SUM(estimated_minutes),0) total FROM study_tasks WHERE study_plan_id=? AND scheduled_date=? AND completion_status!='skipped'",id,date)?.total??0;
    const duplicate=row<{n:number}>("SELECT COUNT(*) n FROM study_tasks WHERE study_plan_id=? AND topic_id=? AND scheduled_date=? AND completion_status!='skipped'",id,weak.id,date)?.n??0;
    if(load+duration<=plan.daily_available_minutes&&!duplicate){
      try{
        const recommendation=await generateText(
          `You are a study coach. Give a concise, encouraging recommendation in ${language==="bn"?"Bangla":"English"}. Use only the supplied topic and quiz evidence. Do not invent causes, skills, or past behavior. Suggest a concrete way to use the review session.`,
          `Topic: ${weak.topic_name}\nCorrect answers: ${weak.mastery_score}% across ${weak.assessed_question_count} assessed responses.\nA ${duration}-minute review session is being added to the student's schedule. Recommend how to use this session in 1-2 sentences.`
        );
        const taskId=randomUUID();const title=language==="bn"?`${weak.topic_name} আবার পড়ুন`:`Review: ${weak.topic_name}`;run("INSERT INTO study_tasks (id,study_plan_id,topic_id,task_title,task_type,scheduled_date,estimated_minutes,priority) VALUES (?,?,?,?,?,?,?,?)",taskId,id,weak.id,title,"adaptive_revision",date,duration,"high");
        return NextResponse.json({task:row("SELECT * FROM study_tasks WHERE id=?",taskId),recommendation},{status:201});
      }catch(error){return errorResponse(error instanceof Error?error.message:"Could not create a local AI study recommendation.",aiErrorStatus(error));}
    }
  }
  return errorResponse("There is no available study time before the exam for an extra review. Increase your availability or move a pending task first.",422);
}
