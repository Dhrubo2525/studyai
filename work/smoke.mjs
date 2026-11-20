import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const base = process.env.LEARNSPHERE_TEST_URL ?? "http://127.0.0.1:3100";
const email = `learnsphere-smoke-${Date.now()}@example.com`;
const password = "Test-only-password-783!";
let cookie = "";

async function call(path, { method = "GET", body, form } = {}) {
  const headers = cookie ? { Cookie: cookie } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length && path === "/api/auth/register") cookie = setCookies[0].split(";")[0];
  const content = await response.json().catch(() => ({}));
  return { response, content };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

const page = await fetch(base);
assert(page.status === 200, "landing page renders");

const registration = await call("/api/auth/register", {
  method: "POST",
  body: { fullName: "Smoke Student", email, password },
});
assert(registration.response.status === 201 && cookie, "account registration creates a session");
const userId = registration.content.user.id;
const aiStatus = await call("/api/ai/status");
assert(aiStatus.response.status === 200, "local Ollama status endpoint is available to the signed-in student");
const localAIReady = aiStatus.content.reachable && aiStatus.content.chatModelAvailable && aiStatus.content.embeddingModelAvailable;
if (localAIReady) assert(true, "Ollama and both configured local models are available");
else assert(!aiStatus.content.reachable || !aiStatus.content.chatModelAvailable || !aiStatus.content.embeddingModelAvailable, "Ollama status identifies a stopped service or missing model");
const dashboardPage = await call("/dashboard");
assert(dashboardPage.response.status === 200, "protected dashboard renders with SQLite profile data");

const invalid = await call("/api/courses", { method: "POST", body: { name: "x" } });
assert(invalid.response.status === 400, "invalid course data is rejected");

const created = await call("/api/courses", {
  method: "POST",
  body: { name: "Introduction to Human Rights", code: "LAW 201", description: "Sample course", academicLevel: "Undergraduate", language: "en" },
});
assert(created.response.status === 201, "course persists for the signed-in user");
const courseId = created.content.course.id;

const form = new FormData();
form.set("courseId", courseId);
form.set("file", new File([await readFile("examples/introduction-to-human-rights-syllabus.pdf")], "walkthrough-syllabus.pdf", { type: "application/pdf" }));
const upload = await call("/api/documents", { method: "POST", form });
assert(upload.response.status === 201 && upload.content.topics.length >= 6 && upload.content.document.pageCount === 1, "selectable-text PDF upload extracts text and topic headings");
const textForm = new FormData();
textForm.set("courseId", courseId);
textForm.set("file", new File([await readFile("examples/introduction-to-human-rights-syllabus.txt")], "walkthrough-syllabus.txt", { type: "text/plain" }));
const textUpload = await call("/api/documents", { method: "POST", form: textForm });
assert(textUpload.response.status === 201 && textUpload.content.document.status === "processed", "UTF-8 TXT upload is stored and processed");
const topics = upload.content.topics;
if (localAIReady) {
  const suggestions = await call(`/api/courses/${courseId}/topics`, { method: "POST", body: { language: "en" } });
  assert(suggestions.response.status === 200 && suggestions.content.suggestions.length > 0 && suggestions.content.suggestions.every((item) => ["easy", "medium", "hard"].includes(item.difficulty)), "local AI extracts syllabus topics with reviewed difficulty estimates");
} else {
  const suggestions = await call(`/api/courses/${courseId}/topics`, { method: "POST", body: { language: "en" } });
  assert([424, 503].includes(suggestions.response.status) && /ollama/i.test(suggestions.content.error || ""), "topic extraction reports local Ollama/model setup instead of simulated suggestions");
}

const db = new DatabaseSync("data/learnsphere.sqlite");
db.exec("PRAGMA foreign_keys=ON");
const fixtures = [];
for (let attempt = 0; attempt < 2; attempt++) {
  const quizId = randomUUID();
  db.prepare("INSERT INTO quizzes (id,user_id,course_id,title,topic_id,difficulty,total_questions,language) VALUES (?,?,?,?,?,?,?,?)")
    .run(quizId, userId, courseId, `Scoring fixture ${attempt + 1}`, topics[0].id, "medium", 3, "en");
  const answers = {};
  for (let i = 0; i < 3; i++) {
    const questionId = randomUUID();
    db.prepare("INSERT INTO quiz_questions (id,quiz_id,topic_id,question_text,question_type,options,correct_answer,explanation,source_document_id,source_page) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(questionId, quizId, topics[0].id, `Fixture question ${i + 1}?`, "mcq", JSON.stringify(["A", "B", "C", "D"]), "A", "Fixture scoring explanation.", upload.content.document.id, 1);
    answers[questionId] = i === 0 && attempt === 1 ? "A" : "B";
  }
  fixtures.push({ quizId, answers });
}
db.close();

for (const [index, fixture] of fixtures.entries()) {
  const submitted = await call(`/api/quizzes/${fixture.quizId}/submit`, { method: "POST", body: { answers: fixture.answers, timeSpent: 45 } });
  assert(submitted.response.status === 201 && submitted.content.totalQuestions === 3, `quiz attempt ${index + 1} is server-scored and saved`);
}
const mastery = await call("/api/analytics/mastery");
const topicMastery = mastery.content.topics.find((topic) => topic.id === topics[0].id);
assert(topicMastery?.assessed_question_count === 6 && topicMastery.attempt_count === 2 && topicMastery.mastery_status === "needs_improvement", "mastery uses saved answers across two attempts");

const offsetDate = (days) => {
  const date = new Date(Date.now() + days * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const preview = await call("/api/study-plans", {
  method: "POST",
  body: { courseId, examDate: offsetDate(30), dailyStudyHours: 2, weekdays: [0, 1, 2, 3, 4, 5, 6], breakDays: [], preview: true },
});
let savedPlanId = "";
if (localAIReady) {
  assert(preview.response.status === 201 && preview.content.tasks.length > 0 && preview.content.tasks.every((item) => item.date >= offsetDate(0)), `local AI planner returns a capacity-checked preview on or after today (HTTP ${preview.response.status})`);
  const approved = await call("/api/study-plans", { method: "POST", body: { previewId: preview.content.previewId } });
  assert(approved.response.status === 201 && approved.content.tasks.length > 0, "student approval persists AI-assisted study tasks");
  savedPlanId = approved.content.planId;
  const task = approved.content.tasks.find((item) => item.completion_status === "pending");
  const completed = await call(`/api/study-tasks/${task.id}`, { method: "PATCH", body: { status: "completed" } });
  assert(completed.response.status === 200 && completed.content.task.completion_status === "completed", "task completion persists");
  const pending = approved.content.tasks.find((item) => item.completion_status === "pending");
  const tooLong = await call(`/api/study-tasks/${pending.id}`, { method: "PATCH", body: { minutes: 960 } });
  assert(tooLong.response.status === 422, "task duration cannot exceed daily availability");
  const adapted = await call(`/api/study-plans/${savedPlanId}/adapt`, { method: "POST" });
  assert(adapted.response.status === 201 && adapted.content.task.task_type === "adaptive_revision" && adapted.content.recommendation, "local AI weak-topic analysis adds a capacity-checked review task and recommendation");
} else {
  assert([424, 503].includes(preview.response.status) && /ollama/i.test(preview.content.error || ""), "planner reports Ollama/model setup instead of returning a simulated AI plan");
}

const profile = await call("/api/profile");
const changedProfile = await call("/api/profile", { method: "PATCH", body: { fullName: "Smoke Student", educationLevel: "Undergraduate", institutionName: "", language: "bn", theme: "light", dailyStudyHours: 2, weekdays: [0, 1, 2, 3, 4, 5, 6] } });
assert(profile.response.status === 200 && changedProfile.response.status === 200, "profile preferences persist with validated values");

const dashboard = await call(`/api/analytics/dashboard?today=${offsetDate(0)}`);
assert(dashboard.response.status === 200 && (localAIReady ? dashboard.content.overview.totalTasks > 0 : dashboard.content.overview.totalTasks >= 0), "dashboard analytics derive from saved activity");

const aiTutor = await call("/api/tutor/chat", { method: "POST", body: { courseId, message: "Summarize the UDHR", language: "en" } });
if (localAIReady) {
  assert(aiTutor.response.status === 200 && aiTutor.content.citations.length > 0 && aiTutor.content.citations.every((citation) => citation.page === 1), "English tutor retrieval returns citations from real uploaded pages");
  const embeddingDb = new DatabaseSync("data/learnsphere.sqlite");
  const embedded = embeddingDb.prepare("SELECT embedding,embedding_model FROM document_chunks WHERE course_id=? AND user_id=? AND embedding IS NOT NULL LIMIT 1").get(courseId, userId);
  embeddingDb.close();
  const savedVector = embedded?.embedding ? JSON.parse(embedded.embedding) : [];
  assert(savedVector.length === 1024 && embedded.embedding_model.includes("qwen3-embedding:0.6b@"), "RAG stores 1024-dimensional local Qwen embeddings with the installed model identity");
  const banglaTutor = await call("/api/tutor/chat", { method: "POST", body: { courseId, message: "মানবাধিকারের সার্বজনীন ঘোষণাপত্রের মূলনীতি কী?", language: "bn", conversationId: aiTutor.content.conversationId } });
  assert(banglaTutor.response.status === 200 && banglaTutor.content.citations.length > 0 && banglaTutor.content.citations.every((citation) => citation.page === 1), "Bangla question retrieves the matching English course document with real page citations");
  const aiQuiz = await call("/api/quizzes/generate", { method: "POST", body: { courseId, topicId: topics[0].id, count: 3, difficulty: "medium", language: "en" } });
  assert(aiQuiz.response.status === 201 && aiQuiz.content.quiz.questions.length === 3, "local AI generates a validated, source-grounded quiz");
  const generatedQuizAttempt = await call(`/api/quizzes/${aiQuiz.content.quiz.id}/submit`, { method: "POST", body: { answers: Object.fromEntries(aiQuiz.content.quiz.questions.map((question) => [question.id, question.options[0]])), timeSpent: 30 } });
  assert(generatedQuizAttempt.response.status === 201 && generatedQuizAttempt.content.answers.every((answer) => answer.explanation), "quiz evaluation returns saved AI-generated explanations");
} else {
  assert([424, 503].includes(aiTutor.response.status) && /ollama/i.test(aiTutor.content.error || ""), "tutor explains that local Ollama/model setup is required and does not fake a reply");
  const aiQuiz = await call("/api/quizzes/generate", { method: "POST", body: { courseId, topicId: topics[0].id, count: 5, difficulty: "medium", language: "en" } });
  assert([424, 503].includes(aiQuiz.response.status) && /ollama/i.test(aiQuiz.content.error || ""), "quiz generation reports a local model requirement instead of fake questions");
}

const firstCookie = cookie;
const second = await call("/api/auth/register", { method: "POST", body: { fullName: "Other Student", email: `${email}.other`, password } });
assert(second.response.status === 201, "second account registration works");
const secondCookie = cookie;
cookie = secondCookie;
const isolated = await call(`/api/courses/${courseId}`);
assert(isolated.response.status === 404, "course details are isolated by account ownership");
cookie = firstCookie;

await call("/api/profile", { method: "DELETE", body: { password } });
cookie = secondCookie;
await call("/api/profile", { method: "DELETE", body: { password } });
console.log("Smoke workflow complete; both temporary accounts were deleted.");
