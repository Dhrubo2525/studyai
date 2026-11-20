import { NextResponse } from "next/server";
import { rows,row,run } from "@/lib/db";
import { errorResponse,isResponse,requireUser } from "@/lib/http";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const {id}=await context.params;const conversation=row<any>("SELECT id,course_id,title,created_at FROM tutor_conversations WHERE id=? AND user_id=?",id,auth.id);
  if(!conversation)return errorResponse("Conversation not found.",404);
  return NextResponse.json({conversation,messages:rows<any>("SELECT id,role,message_content,citations,created_at FROM tutor_messages WHERE conversation_id=? ORDER BY created_at,rowid",id).map(m=>({...m,citations:JSON.parse(m.citations)}))});
}
export async function DELETE(_request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if(isResponse(auth))return auth;
  const {id}=await context.params;const result=run("DELETE FROM tutor_conversations WHERE id=? AND user_id=?",id,auth.id);
  if(!result.changes)return errorResponse("Conversation not found.",404);
  return NextResponse.json({ok:true});
}
