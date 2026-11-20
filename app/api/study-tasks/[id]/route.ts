import { NextResponse } from "next/server";
import { z } from "zod";
import { row, run } from "@/lib/db";
import { errorResponse, isResponse, requireUser } from "@/lib/http";

const schema=z.object({status:z.enum(["pending","completed","skipped"]).optional(),date:z.string().date().optional(),minutes:z.number().int().min(10).max(960).optional()}).refine(v=>Object.keys(v).length>0);
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const {id}=await context.params;const task=row<any>("SELECT t.* FROM study_tasks t JOIN study_plans p ON p.id=t.study_plan_id WHERE t.id=? AND p.user_id=?",id,auth.id);
  if(!task)return errorResponse("Study task not found.",404);
  let body:any;try{body=await request.json();}catch{return errorResponse("Request body must be valid JSON.");}
  const parsed=schema.safeParse(body);if(!parsed.success)return errorResponse(parsed.error.issues[0]?.message||"Check the task update.");
  const p=parsed.data;
  if(p.date||p.minutes){
    const plan=row<any>("SELECT daily_available_minutes,exam_date FROM study_plans WHERE id=?",task.study_plan_id);
    const date=p.date??task.scheduled_date;const minutes=p.minutes??task.estimated_minutes;
    if(minutes>plan.daily_available_minutes)return errorResponse("This task would exceed your daily study-hour limit.",422);
    if(date>plan.exam_date)return errorResponse("A task cannot be scheduled after the examination date.",422);
    if(date!==task.scheduled_date||minutes!==task.estimated_minutes){const load=row<{total:number}>("SELECT COALESCE(SUM(estimated_minutes),0) total FROM study_tasks WHERE study_plan_id=? AND scheduled_date=? AND completion_status!='skipped' AND id!=?",task.study_plan_id,date,id)?.total??0;if(load+minutes>plan.daily_available_minutes)return errorResponse("That date is already at your daily study-hour limit.",422);}
    run("UPDATE study_tasks SET scheduled_date=?,estimated_minutes=? WHERE id=?",date,minutes,id);
  }
  if(p.status)run("UPDATE study_tasks SET completion_status=?,completed_at=? WHERE id=?",p.status,p.status==="completed"?new Date().toISOString():null,id);
  return NextResponse.json({task:row("SELECT * FROM study_tasks WHERE id=?",id)});
}
