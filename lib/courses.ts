import { row } from "@/lib/db";
export type Course = { id: string; user_id: string; course_name: string; course_code: string; description: string; exam_date: string | null; preferred_language: string; };
export function ownedCourse(courseId: string, userId: string) {
  return row<Course>("SELECT id,user_id,course_name,course_code,description,exam_date,preferred_language FROM courses WHERE id=? AND user_id=?", courseId, userId);
}
