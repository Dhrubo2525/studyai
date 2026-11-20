"use client";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { Language } from "@/lib/i18n";

type Status = {
  reachable: boolean;
  chatModel: string;
  chatModelAvailable: boolean;
  embeddingModel: string;
  embeddingModelAvailable: boolean;
  message: string | null;
};

export function AIStatusBanner({ language }: { language: Language }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/ai/status", { cache: "no-store" });
        if (!response.ok) return;
        const next = await response.json() as Status;
        if (alive) setStatus(next);
      } catch { /* Keep the last known connection state until the next poll. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  if (!status || (status.reachable && status.chatModelAvailable && status.embeddingModelAvailable)) return null;
  const bn = language === "bn";
  const commands = [
    ...(status.reachable && !status.chatModelAvailable ? [`ollama pull ${status.chatModel}`] : []),
    ...(status.reachable && !status.embeddingModelAvailable ? [`ollama pull ${status.embeddingModel}`] : []),
  ];
  return <div className="ai-status-banner" role="status">
    <AlertCircle size={18}/>
    <div>
      <strong>{!status.reachable ? (bn ? "Ollama সংযোগ পাওয়া যাচ্ছে না" : "Ollama is not running") : (bn ? "Ollama মডেল ইনস্টল করা নেই" : "An Ollama model is missing")}</strong>
      <p>{!status.reachable
        ? (bn ? "এই কম্পিউটারে Ollama ইনস্টল করে অ্যাপটি চালু করুন। তারপর আবার চেষ্টা করুন।" : "Install Ollama on this computer, open the Ollama app, then retry.")
        : (bn ? "PowerShell খুলে নিচের কমান্ডগুলো চালান, তারপর আবার চেষ্টা করুন।" : "Run the missing model commands in PowerShell, then retry.")}</p>
      {!status.reachable && <a href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">{bn ? "Ollama ইনস্টল নির্দেশনা" : "Ollama installation instructions"}</a>}
      {commands.map(command => <code key={command}>{command}</code>)}
      {status.message && !status.reachable && <small>{status.message}</small>}
    </div>
  </div>;
}
