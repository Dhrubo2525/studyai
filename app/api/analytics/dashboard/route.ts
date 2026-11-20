import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rows, row } from "@/lib/db";
import { localIsoDate } from "@/lib/dates";
import { errorResponse } from "@/lib/http";
export async function GET(request:Request){
  const user=await currentUser();if(!user)return errorResponse("Please sign in to continue.",401);
  const todayParam=new URL(request.url).searchParams.get("today");const today=/^\d{4}-\d{2}-\d{2}$/.test(todayParam??"")?todayParam:localIsoDate();
  const profile=row<any>("SELECT full_name,preferred_language,preferred_theme,daily_study_hours FROM profiles WHERE user_id=?",user.id);
  const courses=rows<any>(`SELECT c.id,c.course_name,c.course_code,c.exam_date,
    (SELECT COUNT(*) FROM topics t WHERE t.course_id=c.id) topic_count,
    (SELECT COUNT(*) FROM study_tasks st JOIN study_plans sp ON sp.id=st.study_plan_id WHERE sp.course_id=c.id AND st.completion_status='completed') completed_tasks,
    (SELECT COUNT(*) FROM study_tasks st JOIN study_plans sp ON sp.id=st.study_plan_id WHERE sp.course_id=c.id) total_tasks,
    (SELECT MIN(st.scheduled_date) FROM study_tasks st JOIN study_plans sp ON sp.id=st.study_plan_id WHERE sp.course_id=c.id AND st.completion_status='pending' AND st.scheduled_date>=?) next_task
    FROM courses c WHERE c.user_id=? ORDER BY c.created_at DESC`,today,user.id);
  const tasks=rows<any>(`SELECT st.id,st.task_title,st.task_type,st.scheduled_date,st.estimated_minutes,st.priority,st.completion_status,sp.course_id,c.course_name,st.topic_id
    FROM study_tasks st JOIN study_plans sp ON sp.id=st.study_plan_id JOIN courses c ON c.id=sp.course_id
    WHERE sp.user_id=? AND st.scheduled_date=? AND st.completion_status='pending' ORDER BY st.priority='high' DESC,st.created_at`,user.id,today);
  const counts=row<any>(`SELECT COUNT(*) total,SUM(CASE WHEN completion_status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN completion_status='pending' THEN 1 ELSE 0 END) pending FROM study_tasks t JOIN study_plans p ON p.id=t.study_plan_id WHERE p.user_id=?`,user.id)??{total:0,completed:0,pending:0};
  const quizStats=row<any>("SELECT COUNT(*) attempts,ROUND(AVG(score)) average FROM quiz_attempts WHERE user_id=?",user.id)??{attempts:0,average:null};
  const recentQuizzes=rows<any>(`SELECT a.id,a.score,a.correct_answers,a.total_questions,a.completed_at,q.title,q.course_id,c.course_name
    FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id JOIN courses c ON c.id=q.course_id WHERE a.user_id=? ORDER BY a.completed_at DESC LIMIT 5`,user.id);
  const weakTopics=rows<any>(`SELECT t.topic_name,m.mastery_score,m.assessed_question_count,c.course_name FROM topic_mastery m JOIN topics t ON t.id=m.topic_id JOIN courses c ON c.id=m.course_id WHERE m.user_id=? AND m.mastery_status='needs_improvement' AND m.assessed_question_count>=5 ORDER BY m.mastery_score LIMIT 4`,user.id);
  const completePercent=counts.total?Math.round((counts.completed??0)/counts.total*100):0;
  return NextResponse.json({profile,courses,tasks,overview:{courses:courses.length,topics:courses.reduce((n,c)=>n+c.topic_count,0),completedTasks:counts.completed??0,pendingTasks:counts.pending??0,totalTasks:counts.total??0,progress:completePercent},quizStats,recentQuizzes,weakTopics,today});
}
