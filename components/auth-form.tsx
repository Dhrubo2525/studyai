"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Eye, EyeOff, LoaderCircle, Sparkles } from "lucide-react";
import { t, type Language, type MessageKey } from "@/lib/i18n";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const tr = (key: MessageKey) => t(language, key);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = mode === "register"
      ? { fullName: String(form.get("fullName") || ""), email: String(form.get("email") || ""), password: String(form.get("password") || ""), language }
      : { email: String(form.get("email") || ""), password: String(form.get("password") || "") };
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not continue.");
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-wrap">
    <Link href="/" className="brand auth-brand"><span className="brand-mark"><Sparkles size={17} /></span><span>Syllabus<span className="brand-light">to Study</span></span></Link>
    <div className="auth-card">
      <button type="button" className="language-switch auth-language" onClick={() => setLanguage(language === "en" ? "bn" : "en")} aria-label={tr("language")}><span className={language === "en" ? "lang-on" : ""}>EN</span><i /><span className={language === "bn" ? "lang-on" : ""}>বাং</span></button>
      <div className="auth-icon"><BookOpen size={19} /></div>
      <span className="auth-kicker">{language === "bn" ? "আপনার ব্যক্তিগত পড়ার জায়গা" : "YOUR PERSONAL STUDY SPACE"}</span>
      <h1>{tr(mode === "login" ? "welcomeBack" : "makeRoom")}</h1>
      <p>{tr(mode === "login" ? "signInContinue" : "createPrivate")}</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>{tr("fullName")}<input name="fullName" autoComplete="name" required maxLength={100} placeholder={tr("yourName")} /></label>}
        <label>{tr("email")}<input type="email" name="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
        <label>{tr("password")}<div className="password-wrap"><input type={show ? "text" : "password"} name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 10} maxLength={128} placeholder={mode === "login" ? tr("password") : tr("passwordHint")} /><button type="button" className="password-toggle" onClick={() => setShow(value => !value)} aria-label={show ? tr("hidePassword") : tr("showPassword")}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" />{tr("pleaseWait")}</> : <>{tr(mode === "login" ? "signIn" : "createAccount")}<ArrowRight size={16} /></>}</button>
      </form>
      <div className="auth-switch">{mode === "login" ? <>{tr("newHere")} <Link href="/register">{tr("createAccount")}</Link></> : <>{tr("alreadyAccount")} <Link href="/login">{tr("signIn")}</Link></>}</div>
      <div className="auth-privacy"><span />{tr("privateSpace")}</div>
    </div>
    <Link href="/" className="back-home">← {tr("backHome")}</Link>
  </div>;
}
