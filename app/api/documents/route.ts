import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { findHeadings, saveChunks, type ExtractedPage } from "@/lib/document-processing";
import { ownedCourse } from "@/lib/courses";
import { inTransaction, rows, run } from "@/lib/db";
import { errorResponse, isResponse, requireUser } from "@/lib/http";

export const runtime = "nodejs";
const MAX_BYTES = 15 * 1024 * 1024;
function chunkText(text: string, page: number): ExtractedPage[] {
  const clean = text.replace(/\u0000/g, " ").trim();
  return clean ? [{ page, text: clean }] : [];
}

export async function GET() {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  return NextResponse.json({ documents: rows(`SELECT d.id,d.course_id,d.file_name,d.file_type,d.file_size,d.page_count,d.processing_status,d.created_at,c.course_name FROM documents d JOIN courses c ON c.id=d.course_id WHERE d.user_id=? ORDER BY d.created_at DESC`, auth.id) });
}

export async function POST(request: Request) {
  const auth = await requireUser(); if (isResponse(auth)) return auth;
  let form: FormData;
  try { form = await request.formData(); } catch { return errorResponse("Upload a PDF or text document."); }
  const courseId = form.get("courseId"); const file = form.get("file");
  if (typeof courseId !== "string" || !ownedCourse(courseId, auth.id)) return errorResponse("Choose one of your courses before uploading.", 404);
  if (!(file instanceof File)) return errorResponse("Choose a file to upload.");
  if (file.size < 1 || file.size > MAX_BYTES) return errorResponse("Files must be under 15 MB.");
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180);
  const ext = path.extname(name).toLowerCase();
  if (!([".pdf", ".txt"].includes(ext))) return errorResponse("Only PDF and TXT files are supported.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const docId = randomUUID();
  const uploads = path.join(process.cwd(), "data", "uploads", auth.id);
  await mkdir(uploads, { recursive: true });
  const target = path.join(uploads, `${docId}${ext}`);
  let pages: ExtractedPage[] = [];
  let pageCount = 1;
  try {
    if (ext === ".pdf") {
      if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return errorResponse("This file is not a valid PDF.");
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
      pageCount = pdf.numPages;
      if (pageCount > 100) return errorResponse("PDFs can contain at most 100 pages.");
      for (let n = 1; n <= pageCount; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`).join("");
        pages.push(...chunkText(text, n));
      }
      await pdf.destroy();
    } else {
      if (file.type && !["text/plain", "application/octet-stream"].includes(file.type)) return errorResponse("Text uploads must be plain TXT files.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\u0000")) return errorResponse("This text file contains binary data and cannot be processed.");
      pages = chunkText(text, 1);
    }
    if (!pages.length) return errorResponse("No selectable text was found. Scanned PDFs are not supported yet; try a text-based PDF or TXT file.", 422);
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    const headings = findHeadings(pages);
    const inserted: { id: string; name: string; page: number }[] = [];
    inTransaction(() => {
      run("INSERT INTO documents (id,user_id,course_id,file_name,storage_path,file_type,file_size,page_count,processing_status) VALUES (?,?,?,?,?,?,?,?,?)", docId, auth.id, courseId, name, target, ext === ".pdf" ? "application/pdf" : "text/plain", bytes.length, pageCount, "processed");
      saveChunks(docId, auth.id, courseId, pages);
      const already = new Set(rows<{ topic_name:string }>("SELECT topic_name FROM topics WHERE course_id=?", courseId).map(t => t.topic_name.toLowerCase()));
      for (const [i, heading] of headings.entries()) {
        if (already.has(heading.name.toLowerCase())) continue;
        const topicId = randomUUID();
        run("INSERT INTO topics (id,course_id,topic_name,difficulty_level,estimated_minutes,source_document_id,source_page,sort_order) VALUES (?,?,?,?,?,?,?,?)", topicId, courseId, heading.name, "medium", 45, docId, heading.page, i + 1);
        inserted.push({ id: topicId, name: heading.name, page: heading.page });
      }
    });
    return NextResponse.json({ document: { id: docId, courseId, fileName: name, pageCount, status: "processed" }, extractedPages: pageCount, topics: inserted, topicMethod: "document headings; review and edit before planning" }, { status: 201 });
  } catch (error) {
    await rm(target, { force: true }).catch(() => {});
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("encoding")) return errorResponse("The text file is not valid UTF-8.");
    return errorResponse("Document processing failed. Check that this is a readable PDF or plain text file and try again.", 422);
  }
}
