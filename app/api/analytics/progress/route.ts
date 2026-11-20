import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rows,row } from "@/lib/db";
import { localIsoDate } from "@/lib/dates";
import { errorResponse } from "@/lib/http";
export async function GET(request:Request){
  const user=await currentUser();if(!user)return errorResponse("Please sign in to continue.",401);
  const history=rows<any>(`SELECT a.id,a.score,a.correct_answers,a.total_questions,a.completed_at,q.title,q.topic_id,t.topic_name,q.course_id,c.course_name
    FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id JOIN courses c ON c.id=q.course_id LEFT JOIN topics t ON t.id=q.topic_id WHERE a.user_id=? ORDER BY a.completed_at DESC LIMIT 40`,user.id);
  const topics=rows<any>(`SELECT t.id,t.topic_name,t.course_id,c.course_name,
    COUNT(qa.id) assessed_question_count,SUM(CASE WHEN qa.is_correct=1 THEN 1 ELSE 0 END) correct_count,
    COUNT(DISTINCT a.id) attempt_count,MAX(a.completed_at) last_assessed_at
    FROM topics t JOIN courses c ON c.id=t.course_id LEFT JOIN quiz_questions qq ON qq.topic_id=t.id
    LEFT JOIN quiz_answers qa ON qa.question_id=qq.id LEFT JOIN quiz_attempts a ON a.id=qa.attempt_id AND a.user_id=?
    WHERE c.user_id=? GROUP BY t.id ORDER BY c.course_name,t.sort_order`,user.id,user.id).map((t:any)=>{
      const count=Number(t.assessed_question_count)||0;const score=count?Math.round(Number(t.correct_count||0)/count*100):null;
      const status=count<5||Number(t.attempt_count)<2||score===null?"not_enough_data":score>=80?"mastered":score>=60?"developing":"needs_improvement";
      return {...t,mastery_score:score,mastery_status:status};
    });
  const tasks=row<any>(`SELECT COUNT(*) total,SUM(CASE WHEN completion_status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN completion_status='pending' THEN 1 ELSE 0 END) pending FROM study_tasks st JOIN study_plans p ON p.id=st.study_plan_id WHERE p.user_id=?`,user.id)??{total:0,completed:0,pending:0};
  const activity=rows<{date:string;completed:number}>(`SELECT date(st.completed_at) date,COUNT(*) completed FROM study_tasks st JOIN study_plans p ON p.id=st.study_plan_id WHERE p.user_id=? AND st.completion_status='completed' AND st.completed_at>=datetime('now','-6 days') GROUP BY date(st.completed_at)`,user.id);
  const weeklyActivity=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);const date=localIsoDate(d);return {date,completed:activity.find(a=>a.date===date)?.completed??0};});
  const average=history.length?Math.round(history.reduce((n,a)=>n+a.score,0)/history.length):null;
  const language=new URL(request.url).searchParams.get("language")==="bn"?"bn":"en";
  const recommendations:string[]=[];
  const weak=topics.filter((t:any)=>t.mastery_status==="needs_improvement");
  if(weak.length)recommendations.push(language==="bn"?`${weak[0].topic_name} আবার পড়ুন: সাম্প্রতিক ${weak[0].assessed_question_count}টি উত্তরের মধ্যে ${weak[0].mastery_score}% সঠিক।`:`Review ${weak[0].topic_name}: recent answers are ${weak[0].mastery_score}% correct across ${weak[0].assessed_question_count} responses.`);
  const developing=topics.filter((t:any)=>t.mastery_status==="developing");
  if(developing.length)recommendations.push(language==="bn"?`${developing[0].topic_name} অনুশীলন চালিয়ে যান; বর্তমান ফল ${developing[0].mastery_score}%。`:`Continue practicing ${developing[0].topic_name}; current assessed performance is ${developing[0].mastery_score}%.`);
  if(Number(tasks.pending)>0)recommendations.push(language==="bn"?`আপনার পরিকল্পনায় ${tasks.pending}টি পড়ার কাজ এখনও বাকি।`:`You have ${tasks.pending} unfinished study task${tasks.pending===1?"":"s"} on your current plans.`);
  return NextResponse.json({history,topics,tasks,average,recommendations,weeklyActivity,masteryRule:"At least 5 answered questions over 2 quiz attempts are required before assigning a mastery level."});
}
