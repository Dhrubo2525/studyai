import { unlink } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/learnsphere.sqlite");
const users = db.prepare("SELECT id FROM users WHERE email LIKE 'learnsphere-smoke-%@example.com%'").all();
const files = [];
db.exec("BEGIN IMMEDIATE");
try {
  for (const user of users) {
    files.push(...db.prepare("SELECT storage_path,user_id FROM documents WHERE user_id=?").all(user.id));
    db.prepare("DELETE FROM users WHERE id=?").run(user.id);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  db.close();
  throw error;
}
db.close();
for (const file of files) {
  const base = path.resolve("data", "uploads", file.user_id) + path.sep;
  const target = path.resolve(file.storage_path);
  if (target.startsWith(base)) await unlink(target).catch(() => {});
}
console.log(`Removed ${users.length} temporary smoke accounts and their uploaded files.`);
