"use client";
import { createContext,useContext,useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { usePathname,useRouter } from "next/navigation";
import { Activity,BookOpen,BookOpenCheck,CalendarDays,ChevronDown,GraduationCap,LayoutDashboard,LogOut,Menu,Moon,Settings,Sun,Sparkles,X,Zap } from "lucide-react";
import { t,type Language } from "@/lib/i18n";
import { AIStatusBanner } from "@/components/ai-status-banner";

type Profile={full_name:string;education_level:string;institution_name:string;preferred_language:Language;preferred_theme:"dark"|"light";daily_study_hours:number;available_weekdays:string};
type LanguageContextValue={language:Language;setLanguage:(language:Language)=>void;theme:"dark"|"light";setTheme:(theme:"dark"|"light")=>void};
const LanguageContext=createContext<LanguageContextValue>({language:"en",setLanguage:()=>{},theme:"dark",setTheme:()=>{}});
export const useLanguage=()=>useContext(LanguageContext).language;
export const useSetLanguage=()=>useContext(LanguageContext).setLanguage;
export const useSetTheme=()=>useContext(LanguageContext).setTheme;
const nav=[{href:"/dashboard",key:"dashboard" as const,icon:LayoutDashboard},{href:"/courses",key:"courses" as const,icon:BookOpen},{href:"/study-plan",key:"plan" as const,icon:CalendarDays},{href:"/tutor",key:"tutor" as const,icon:Sparkles},{href:"/quizzes",key:"quizzes" as const,icon:BookOpenCheck},{href:"/progress",key:"progress" as const,icon:Activity}];
export function AppShell({children,user,profile:initial}:{children:React.ReactNode;user:{id:string;email:string};profile:Profile}){
  const router=useRouter();const pathname=usePathname();const [language,setLanguage]=useState<Language>(initial.preferred_language);const [theme,setTheme]=useState<"dark"|"light">(initial.preferred_theme);const [open,setOpen]=useState(false);const [profile,setProfile]=useState(initial);
  const initials=useMemo(()=>profile.full_name?.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||user.email.slice(0,2).toUpperCase(),[profile.full_name,user.email]);
  useEffect(()=>{document.documentElement.lang=language;document.documentElement.dataset.theme=theme;},[language,theme]);
  useEffect(()=>{setOpen(false);},[pathname]);
  async function savePreference(next:{language?:Language;theme?:"dark"|"light"}){
    const updated={...profile,...(next.language?{preferred_language:next.language}:{}),...(next.theme?{preferred_theme:next.theme}:{})};
    setProfile(updated);if(next.language)setLanguage(next.language);if(next.theme)setTheme(next.theme);
    try{const res=await fetch("/api/profile");const data=await res.json();if(data.profile){const p={...data.profile,...(next.language?{language:next.language}:{}),...(next.theme?{theme:next.theme}:{})};await fetch("/api/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});}}
    catch{/* Keep the local preference even when the profile cannot be reached. */}
  }
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});router.push("/login");router.refresh();}
  function navLink(item:typeof nav[number],mobile=false){const active=pathname===item.href||pathname.startsWith(item.href+"/");const Icon=item.icon;return <Link key={item.href} href={item.href} className={`nav-link ${active?"active":""} ${mobile?"mobile-nav-link":""}`}><Icon size={18} strokeWidth={1.8}/><span>{t(language,item.key)}</span>{item.key==="tutor"&&<span className="nav-ai-dot"/>}</Link>}
  return <LanguageContext.Provider value={{language,setLanguage,theme,setTheme}}><div className="app-frame"><aside className={`app-sidebar ${open?"sidebar-open":""}`}>
    <Link href="/dashboard" className="sidebar-brand"><span className="brand-mark"><Sparkles size={17}/></span><span><b>Syllabus</b><small>to Study</small></span><button className="sidebar-close" onClick={()=>setOpen(false)} aria-label={t(language,"closeMenu")}><X size={17}/></button></Link>
    <div className="workspace-label">{t(language,"learningSpace")} <ChevronDown size={13}/></div><div className="course-pill"><span className="course-pill-mark"><GraduationCap size={15}/></span><span>{t(language,"myWorkspace")}</span><span className="online-dot"/></div>
    <div className="sidebar-caption">{t(language,"studySection")}</div><nav className="side-nav">{nav.map(item=>navLink(item))}</nav>
    <div className="sidebar-caption sidebar-lower">{t(language,"preferencesSection")}</div><nav className="side-nav"><Link href="/materials" className={`nav-link ${pathname==="/materials"?"active":""}`}><BookOpenCheck size={18}/><span>{t(language,"materials")}</span></Link><Link href="/settings" className={`nav-link ${pathname==="/settings"?"active":""}`}><Settings size={18}/><span>{t(language,"settings")}</span></Link></nav>
    <div className="sidebar-spacer"/><div className="sidebar-plan"><div className="plan-bolt"><Zap size={15}/></div><b>{t(language,"studySpaceTitle")}</b><p>{t(language,"studySpaceHint")}</p><Link href="/courses">{t(language,"exploreCourses")} <span>→</span></Link></div>
    <div className="sidebar-account"><span className="user-avatar">{initials}</span><span className="account-copy"><b>{profile.full_name||t(language,"student")}</b><small>{user.email}</small></span><button className="icon-button account-menu" onClick={logout} title={t(language,"logout")} aria-label={t(language,"logout")}><LogOut size={16}/></button></div>
  </aside>
  {open&&<button className="sidebar-scrim" aria-label={t(language,"closeMenu")} onClick={()=>setOpen(false)}/>}
  <div className="app-main"><header className="topbar"><button className="icon-button mobile-menu" onClick={()=>setOpen(true)} aria-label={t(language,"openMenu")}><Menu size={20}/></button><div className="breadcrumb"><span>{t(language,"workspace")}</span><b>/</b><strong>{t(language,nav.find(n=>n.href===pathname)?.key??(pathname==="/settings"?"settings":pathname==="/materials"?"materials":"dashboard"))}</strong></div><div className="topbar-actions"><Link className="topbar-shortcut" href="/courses"><span>⌘</span> {t(language,"newCourseShortcut")}</Link><span className="topbar-divider"/><button className="language-switch" onClick={()=>savePreference({language:language==="en"?"bn":"en"})} aria-label={t(language,"language")}><span className={language==="en"?"lang-on":""}>EN</span><i/> <span className={language==="bn"?"lang-on":""}>বাং</span></button><button className="icon-button theme-button" onClick={()=>savePreference({theme:theme==="dark"?"light":"dark"})} title={theme==="dark"?t(language,"themeLight"):t(language,"themeDark")} aria-label={theme==="dark"?t(language,"themeLight"):t(language,"themeDark")}>{theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}</button><span className="user-avatar avatar-small">{initials}</span></div></header><main className="workspace-content"><AIStatusBanner language={language}/>{children}</main></div>
  <nav className="mobile-bottom-nav">{[nav[0],nav[1],nav[2],nav[3],nav[4]].map(item=>navLink(item,true))}</nav>
  </div></LanguageContext.Provider>;
}
