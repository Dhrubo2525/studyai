import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const globalForDb = globalThis as typeof globalThis & { learnsphereDb?: DatabaseSync };

export const db = globalForDb.learnsphereDb ?? new DatabaseSync(path.join(dataDir, "learnsphere.sqlite"));
globalForDb.learnsphereDb = db;
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, full_name TEXT NOT NULL DEFAULT '',
  education_level TEXT NOT NULL DEFAULT '', institution_name TEXT NOT NULL DEFAULT '',
  preferred_language TEXT NOT NULL DEFAULT 'en', preferred_theme TEXT NOT NULL DEFAULT 'dark',
  daily_study_hours REAL NOT NULL DEFAULT 2, available_weekdays TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,0]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL, course_code TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  academic_level TEXT NOT NULL DEFAULT '', exam_date TEXT, preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL, file_type TEXT NOT NULL, file_size INTEGER NOT NULL, page_count INTEGER NOT NULL DEFAULT 0,
  processing_status TEXT NOT NULL DEFAULT 'processed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, chunk_text TEXT NOT NULL,
  page_number INTEGER NOT NULL, embedding TEXT, embedding_model TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  parent_topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL, topic_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', difficulty_level TEXT NOT NULL DEFAULT 'medium',
  estimated_minutes INTEGER NOT NULL DEFAULT 45, source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  source_page INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS study_plans (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, exam_date TEXT NOT NULL,
  daily_available_minutes INTEGER NOT NULL, plan_status TEXT NOT NULL DEFAULT 'active',
  available_weekdays TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,0]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS plan_previews (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, details TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS study_tasks (
  id TEXT PRIMARY KEY, study_plan_id TEXT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL, task_title TEXT NOT NULL, task_type TEXT NOT NULL DEFAULT 'study',
  scheduled_date TEXT NOT NULL, estimated_minutes INTEGER NOT NULL, priority TEXT NOT NULL DEFAULT 'normal',
  completion_status TEXT NOT NULL DEFAULT 'pending', completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, title TEXT NOT NULL,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL, difficulty TEXT NOT NULL,
  total_questions INTEGER NOT NULL, language TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL, question_text TEXT NOT NULL,
  question_type TEXT NOT NULL, options TEXT NOT NULL, correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '', source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  source_page INTEGER
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE, score REAL NOT NULL,
  total_questions INTEGER NOT NULL, correct_answers INTEGER NOT NULL, time_spent INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, quiz_id)
);
CREATE TABLE IF NOT EXISTS quiz_answers (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_answer TEXT NOT NULL, is_correct INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS topic_mastery (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, mastery_score REAL NOT NULL,
  mastery_status TEXT NOT NULL, assessed_question_count INTEGER NOT NULL DEFAULT 0,
  last_assessed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, topic_id)
);
CREATE TABLE IF NOT EXISTS tutor_conversations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tutor_messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES tutor_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')), message_content TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_course ON documents(course_id);
CREATE INDEX IF NOT EXISTS idx_chunks_course ON document_chunks(course_id);
CREATE INDEX IF NOT EXISTS idx_topics_course ON topics(course_id);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON study_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON tutor_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id, created_at);
`);

// Older SQLite files were created before embeddings were generated locally.
// Add model identity without dropping document text, pages, or existing rows.
const chunkColumns = db.prepare("PRAGMA table_info(document_chunks)").all() as Array<{ name: string }>;
if (!chunkColumns.some(column => column.name === "embedding_model")) {
  db.exec("ALTER TABLE document_chunks ADD COLUMN embedding_model TEXT");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_user_course ON document_chunks(user_id,course_id)");

export function rows<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params as SQLInputValue[]) as T[];
}
export function row<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params as SQLInputValue[]) as T | undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...params as SQLInputValue[]);
}
export function inTransaction<T>(work:()=>T):T {
  db.exec("BEGIN IMMEDIATE");
  try { const result=work(); db.exec("COMMIT"); return result; }
  catch(error) { db.exec("ROLLBACK"); throw error; }
}
export function consumeAiAllowance(userId: string, maxPerHour = 30) {
  db.exec("BEGIN IMMEDIATE");
  try {
    run("DELETE FROM ai_usage WHERE created_at < datetime('now','-2 hours')");
    const used = row<{ n:number }>("SELECT COUNT(*) n FROM ai_usage WHERE user_id=? AND created_at >= datetime('now','-1 hour')",userId)?.n ?? 0;
    if (used >= maxPerHour) { db.exec("ROLLBACK"); return false; }
    run("INSERT INTO ai_usage (id,user_id) VALUES (?,?)",randomUUID(),userId);
    db.exec("COMMIT"); return true;
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}
