import { randomUUID } from "node:crypto";
import { run } from "@/lib/db";

export type ExtractedPage = { page: number; text: string };
export function saveChunks(documentId: string, userId: string, courseId: string, pages: ExtractedPage[]) {
  const insert = run;
  for (const item of pages) {
    const normalized = item.text.replace(/\s+/g, " ").trim();
    for (let start = 0; start < normalized.length; start += 2800) {
      const part = normalized.slice(start, start + 3200).trim();
      if (!part) continue;
      insert("INSERT INTO document_chunks (id,document_id,user_id,course_id,chunk_text,page_number) VALUES (?,?,?,?,?,?)", randomUUID(), documentId, userId, courseId, part, item.page);
    }
  }
}

export function findHeadings(pages: ExtractedPage[]) {
  const found: { name: string; page: number }[] = [];
  const seen = new Set<string>();
  for (const item of pages) {
    for (const raw of item.text.split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim().replace(/^[•▪●\-–—]+\s*/, "");
      const numbered = line.match(/^(?:chapter\s+\d+[\s:.-]+|(?:\d+\.){1,4}\s+)(.{4,100})$/i);
      const isHeading = numbered || (line.length >= 5 && line.length <= 90 && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 12 && (/^[A-Z0-9][\w\s,:()&/-]+$/.test(line) && (line === line.toUpperCase() || /^[A-Z][a-z]/.test(line))));
      const name = (numbered?.[1] ?? (isHeading ? line : "")).replace(/\s+/g, " ").trim();
      const key = name.toLowerCase();
      if (name.length >= 5 && !seen.has(key) && !/^(contents|table of contents|references|bibliography|appendix|learning outcomes)$/i.test(name)) {
        seen.add(key); found.push({ name, page: item.page });
      }
    }
  }
  return found.slice(0, 80);
}
