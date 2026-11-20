import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ownedCourse } from "@/lib/courses";
import { inTransaction,row,rows,run } from "@/lib/db";
import { buildPlan } from "@/lib/planner";
import { errorResponse,isResponse,requireUser } from "@/lib/http";

const schema=z.object({courseId:z.string().uuid().optional(),examDate:z.string().date().optional(),dailyStudyHours:z.number().min(.5).max(16).optional(),weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),breakDays:z.array(z.string().date()).default([]),preview:z.boolean().optional(),previewId:z.string().uuid().optional()});
export async function GET(){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const plans=rows<any>("SELECT p.*,c.course_name FROM study_plans p JOIN courses c ON c.id=p.course_id WHERE p.user_id=? ORDER BY p.updated_at DESC",auth.id);
  const tasks=rows<any>("SELECT t.*,p.course_id,c.course_name,top.topic_name FROM study_tasks t JOIN study_plans p ON p.id=t.study_plan_id JOIN courses c ON c.id=p.course_id LEFT JOIN topics top ON top.id=t.topic_id WHERE p.user_id=? ORDER BY t.scheduled_date,t.created_at",auth.id);
  return NextResponse.json({plans,tasks});
}
export async function POST(request:Request){
  const auth=await requireUser();if(isResponse(auth))return auth;
  let body:any;try{body=await request.json();}catch{return errorResponse("Request body must be valid JSON.");}
  const parsed=schema.safeParse(body);if(!parsed.success)return errorResponse(parsed.error.issues[0]?.message||"Check the study plan settings.");
  const p=parsed.data;if(p.previewId)return approvePreview(p.previewId,auth.id);
  if(!p.courseId||!p.examDate||!p.dailyStudyHours||!p.weekdays)return errorResponse("Provide a course, exam date, available study hours, and study days.");
  const course=ownedCourse(p.courseId,auth.id);if(!course)return errorResponse("Course not found.",404);
  const topics=rows<any>("SELECT id,topic_name,estimated_minutes,difficulty_level FROM topics WHERE course_id=? ORDER BY sort_order,created_at",p.courseId);
  if(!topics.length)return errorResponse("Add and confirm at least one syllabus topic before generating a plan.",422);
  const daily=Math.round(p.dailyStudyHours*60);const weekdays=[...new Set(p.weekdays)];
  const existing=row<{id:string}>("SELECT id FROM study_plans WHERE user_id=? AND course_id=? ORDER BY created_at DESC LIMIT 1",auth.id,p.courseId);
  const completed=existing?rows<any>("SELECT * FROM study_tasks WHERE study_plan_id=? AND completion_status='completed'",existing.id):[];
  if(completed.some(task=>task.scheduled_date>p.examDate!))return errorResponse("The new examination date is before a completed study task. Choose a date that preserves completed work.",422);
  const done=completed.map((x:any)=>x.topic_id).filter(Boolean) as string[];const candidates=topics.filter(t=>!done.includes(t.id));
  // Reuse estimates saved with reviewed syllabus topics. Another full local model
  // call here made a schedule preview wait on slow local hardware.
  const generationMode=candidates.length?"Saved topic estimates · deterministic schedule validation":"No incomplete topics remain";
  const reserved:Record<string,number>={};for(const task of completed)reserved[task.scheduled_date]=(reserved[task.scheduled_date]||0)+Number(task.estimated_minutes||0);
  const proposed=buildPlan(candidates.map(t=>{const x=topics.find(y=>y.id===t.id)!;return {...t,difficulty_level:x.difficulty_level,estimated_minutes:x.estimated_minutes};}),p.examDate,daily,weekdays,new Date(),p.breakDays,reserved);
  if(proposed.warning)return errorResponse(proposed.warning,422);
  const previewId=randomUUID();const expiresAt=new Date(Date.now()+30*60*1000).toISOString();
  const details={courseId:p.courseId,examDate:p.examDate,daily,weekdays,breakDays:p.breakDays,tasks:proposed.tasks,completed,done,snapshot:rows("SELECT id,topic_name FROM topics WHERE course_id=? ORDER BY sort_order,created_at",p.courseId),generationMode};
  run("DELETE FROM plan_previews WHERE expires_at<CURRENT_TIMESTAMP");
  run("INSERT INTO plan_previews (id,user_id,course_id,details,expires_at) VALUES (?,?,?,?,?)",previewId,auth.id,p.courseId,JSON.stringify(details),expiresAt);
  return NextResponse.json({previewId,tasks:proposed.tasks,preservedCompleted:completed.length,generationMode,expiresAt,warning:null},{status:201});
}

function approvePreview(previewId:string,userId:string){
  const preview=row<any>("SELECT * FROM plan_previews WHERE id=? AND user_id=?",previewId,userId);if(!preview)return errorResponse("Study plan preview expired. Generate a new one.",404);
  if(new Date(preview.expires_at).getTime()<Date.now()){run("DELETE FROM plan_previews WHERE id=?",previewId);return errorResponse("Study plan preview expired. Generate a new one.",410);}
  const d=JSON.parse(preview.details);const current=rows("SELECT id,topic_name FROM topics WHERE course_id=? ORDER BY sort_order,created_at",d.courseId);
  if(JSON.stringify(current)!==JSON.stringify(d.snapshot))return errorResponse("Course topics changed after this preview. Generate a fresh plan before approving.",409);
  const loads=new Map<string,number>();for(const task of [...d.completed,...d.tasks]){if(task.scheduled_date>d.examDate)return errorResponse("A task falls after the examination date.",409);loads.set(task.scheduled_date,(loads.get(task.scheduled_date)||0)+Number(task.estimated_minutes));}
  if([...loads.values()].some(n=>n>d.daily))return errorResponse("A study day exceeds your configured time limit. Review the plan settings.",409);
  let planId=row<{id:string}>("SELECT id FROM study_plans WHERE user_id=? AND course_id=? ORDER BY created_at DESC LIMIT 1",userId,preview.course_id)?.id;const created=!planId;planId=planId??randomUUID();
  try{inTransaction(()=>{
    if(created)run("INSERT INTO study_plans (id,user_id,course_id,exam_date,daily_available_minutes,available_weekdays) VALUES (?,?,?,?,?,?)",planId,userId,d.courseId,d.examDate,d.daily,JSON.stringify(d.weekdays));
    else{run("UPDATE study_plans SET exam_date=?,daily_available_minutes=?,available_weekdays=?,plan_status='active',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",d.examDate,d.daily,JSON.stringify(d.weekdays),planId,userId);run("DELETE FROM study_tasks WHERE study_plan_id=? AND completion_status!='completed'",planId);}
    for(const task of d.tasks){const complete=rows<{n:number}>("SELECT COUNT(*) n FROM study_tasks WHERE study_plan_id=? AND topic_id IS ? AND completion_status='completed'",planId,task.topicId)[0]?.n;if(complete)continue;
      run("INSERT INTO study_tasks (id,study_plan_id,topic_id,task_title,task_type,scheduled_date,estimated_minutes,priority) VALUES (?,?,?,?,?,?,?,?)",randomUUID(),planId,task.topicId,task.title,task.type,task.date,task.minutes,task.priority);}
    run("DELETE FROM plan_previews WHERE id=?",previewId);
  });}catch{return errorResponse("Could not save the study plan. Your existing plan is still available.",500);}
  return NextResponse.json({planId,tasks:rows("SELECT * FROM study_tasks WHERE study_plan_id=? ORDER BY scheduled_date,created_at",planId),preservedCompleted:d.completed.length,generationMode:d.generationMode},{status:201});
}
