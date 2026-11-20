import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(file, needle, replacement) {
  const source = await readFile(file, "utf8");
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`Expected one match in ${file}, found ${count}`);
  await writeFile(file, source.replace(needle, replacement), "utf8");
}

await replaceOnce(
  "app/api/courses/[id]/topics/route.ts",
  "Find up to 40 distinct study topics in this material. Return JSON only.",
  "Find up to 40 distinct study topics in this material. Write them in ${language}. Return JSON only.",
);
await replaceOnce(
  "components/views/course-manager.tsx",
  "body:JSON.stringify({})});setSuggestions(data.suggestions);setSuccess(`${data.suggestions.length} AI topic suggestions found. Review them below before saving.`);",
  "body:JSON.stringify({language:lang})});setSuggestions(data.suggestions);setSuccess(lang==='bn'?`${data.suggestions.length}টি এআই পরামর্শ পাওয়া গেছে। সংরক্ষণের আগে পর্যালোচনা করুন।`:`${data.suggestions.length} AI topic suggestions found. Review them below before saving.`);",
);
