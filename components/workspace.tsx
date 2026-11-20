"use client";
import { DashboardView } from "@/components/views/dashboard-view";
import { CourseManager } from "@/components/views/course-manager";
import { PlannerView } from "@/components/views/planner-view";
import { TutorView } from "@/components/views/tutor-view";
import { QuizView } from "@/components/views/quiz-view";
import { ProgressView } from "@/components/views/progress-view";
import { SettingsView } from "@/components/views/settings-view";

export function Workspace({section}:{section:string}){
  if(section==="dashboard")return <DashboardView/>;
  if(section==="courses")return <CourseManager/>;
  if(section==="materials")return <CourseManager materialsOnly/>;
  if(section==="study-plan")return <PlannerView/>;
  if(section==="tutor")return <TutorView/>;
  if(section==="quizzes")return <QuizView/>;
  if(section==="progress")return <ProgressView/>;
  if(section==="settings")return <SettingsView/>;
  return null;
}
