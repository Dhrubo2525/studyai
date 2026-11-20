"use client";
import { useState,type FormEvent } from "react";
import { AlertCircle,CheckCircle2,LoaderCircle } from "lucide-react";

export type Course={id:string;course_name:string;course_code:string;description:string;exam_date:string|null;preferred_language:string;topic_count?:number;document_count?:number;completed_tasks?:number;total_tasks?:number};
export type Topic={id:string;topic_name:string;description:string;difficulty_level:string;estimated_minutes:number;source_document_id:string|null;source_page:number|null;sort_order:number};
export type Doc={id:string;course_id:string;file_name:string;file_type:string;file_size:number;page_count:number;processing_status:string;created_at:string;course_name?:string};
export async function api<T=any>(url:string,init?:RequestInit):Promise<T>{
  const res=await fetch(url,init);let data:any={};try{data=await res.json();}catch{}
  if(!res.ok)throw new Error(data.error||`Request failed (${res.status}).`);return data as T;
}
export function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){
  return <div className="page-heading"><div><span className="section-kicker">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action&&<div className="heading-action">{action}</div>}</div>;
}
export function Notice({kind="info",children}:{kind?:"info"|"error"|"success";children:React.ReactNode}){
  if(!children)return null;const Icon=kind==="error"?AlertCircle:kind==="success"?CheckCircle2:AlertCircle;
  return <div className={`notice notice-${kind}`} role={kind==="error"?"alert":"status"}><Icon size={17}/><span>{children}</span></div>;
}
export function Spinner({label="Loading…"}:{label?:string}){return <div className="loading-state"><LoaderCircle size={20} className="spin"/><span>{label}</span></div>}
export function EmptyState({icon:Icon,title,text,action}:{icon:any;title:string;text:string;action?:React.ReactNode}){return <div className="empty-state"><span className="empty-icon"><Icon size={21}/></span><h3>{title}</h3><p>{text}</p>{action}</div>}
export function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</section></div>}
export function useFormSubmit(handler:(form:FormData)=>Promise<void>){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError("");try{await handler(new FormData(e.currentTarget));}catch(err){setError(err instanceof Error?err.message:"Something went wrong.");}finally{setBusy(false);}};
  return {busy,error,setError,submit};
}
export function dateLabel(date:string,language="en"){
  const d=new Date(`${date}T12:00:00`);return d.toLocaleDateString(language==="bn"?"bn-BD":"en-US",{weekday:"short",month:"short",day:"numeric"});
}
