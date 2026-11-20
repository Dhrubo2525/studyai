import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/lib/auth";
import { row } from "@/lib/db";
export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  const user=await currentUser();if(!user)redirect("/login");
  const profile={...(row<any>("SELECT full_name,education_level,institution_name,preferred_language,preferred_theme,daily_study_hours,available_weekdays FROM profiles WHERE user_id=?",user.id)??{full_name:"Student",education_level:"",institution_name:"",preferred_language:"en",preferred_theme:"dark",daily_study_hours:2,available_weekdays:"[0,1,2,3,4,5,6]"})};
  return <AppShell user={user} profile={profile}>{children}</AppShell>;
}
