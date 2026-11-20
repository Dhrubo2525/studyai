import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { row, run } from "@/lib/db";
import { errorResponse, isResponse, requireUser } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id:string }> }) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const { id } = await context.params;
  let body: any; try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON."); }
  const name = typeof body.fileName === "string" ? body.fileName.trim().replace(/[\\/\u0000-\u001f]/g, "_").slice(0,180) : "";
  if (!name || !/\.(pdf|txt)$/i.test(name)) return errorResponse("Enter a document name ending in .pdf or .txt.");
  const updated = run("UPDATE documents SET file_name=? WHERE id=? AND user_id=?", name, id, auth.id);
  if (!updated.changes) return errorResponse("Document not found.",404);
  return NextResponse.json({ fileName:name });
}
export async function DELETE(_request: Request, context: { params: Promise<{ id:string }> }) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  const { id } = await context.params;
  const doc = row<{ storage_path:string }>("SELECT storage_path FROM documents WHERE id=? AND user_id=?", id, auth.id);
  if (!doc) return errorResponse("Document not found.",404);
  run("DELETE FROM documents WHERE id=? AND user_id=?", id, auth.id);
  const target = path.resolve(doc.storage_path); const base = path.resolve(process.cwd(),"data","uploads",auth.id)+path.sep;
  if (target.startsWith(base)) await rm(target,{force:true}).catch(()=>{});
  return NextResponse.json({ ok:true });
}
