import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rows } from "@/lib/db";
import { errorResponse } from "@/lib/http";
export async function GET(){
  const user=await currentUser();if(!user)return errorResponse("Please sign in to continue.",401);
  const topics=rows<any>(`SELECT t.id,t.topic_name,t.course_id,c.course_name,COUNT(qa.id) assessed_question_count,
    SUM(CASE WHEN qa.is_correct=1 THEN 1 ELSE 0 END) correct_count,COUNT(DISTINCT a.id) attempt_count,MAX(a.completed_at) last_assessed_at
    FROM topics t JOIN courses c ON c.id=t.course_id LEFT JOIN quiz_questions qq ON qq.topic_id=t.id
    LEFT JOIN quiz_answers qa ON qa.question_id=qq.id LEFT JOIN quiz_attempts a ON a.id=qa.attempt_id AND a.user_id=?
    WHERE c.user_id=? GROUP BY t.id ORDER BY c.course_name,t.sort_order`,user.id,user.id).map((t:any)=>{
      const count=Number(t.assessed_question_count)||0;const score=count?Math.round(Number(t.correct_count||0)/count*100):null;
      const status=count<5||Number(t.attempt_count)<2||score===null?"not_enough_data":score>=80?"mastered":score>=60?"developing":"needs_improvement";
      return {...t,mastery_score:score,mastery_status:status};
    });
  return NextResponse.json({topics});
}
