import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { row } from "@/lib/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Syllabus-to-Study AI | Your personal learning companion",
  description: "Turn your syllabus into a personal study plan, source-grounded tutoring, and adaptive practice.",
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  const profile = user ? row<{ preferred_language:string; preferred_theme:string }>("SELECT preferred_language,preferred_theme FROM profiles WHERE user_id=?",user.id) : null;
  return <html lang={profile?.preferred_language === "bn" ? "bn" : "en"} data-theme={profile?.preferred_theme === "light" ? "light" : "dark"} suppressHydrationWarning><body>{children}</body></html>;
}
