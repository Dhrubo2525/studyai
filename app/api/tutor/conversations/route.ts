import { NextResponse } from "next/server";
import { rows } from "@/lib/db";
import { isResponse,requireUser } from "@/lib/http";
export async function GET(){
  const auth=await requireUser();if(isResponse(auth))return auth;
  return NextResponse.json({conversations:rows(`SELECT c.id,c.course_id,c.title,c.created_at,c.updated_at,co.course_name,
    (SELECT message_content FROM tutor_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_message
    FROM tutor_conversations c JOIN courses co ON co.id=c.course_id WHERE c.user_id=? ORDER BY c.updated_at DESC LIMIT 50`,auth.id)});
}
