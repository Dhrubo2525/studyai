import { localIsoDate } from "@/lib/dates";

export type TopicForPlan = { id: string; topic_name: string; estimated_minutes: number; difficulty_level: string };
export type PlannedTask = { topicId: string | null; title: string; type: string; date: string; minutes: number; priority: string };
const iso = localIsoDate;
export function buildPlan(topics: TopicForPlan[], examDate: string, dailyMinutes: number, weekdays: number[], start = new Date(), breakDays: string[] = [], reserved: Record<string,number> = {}): { tasks: PlannedTask[]; warning: string | null } {
  const deadline = new Date(`${examDate}T23:59:59`);
  const workDays: Date[] = [];
  const day = new Date(start); day.setHours(0, 0, 0, 0);
  while (day <= deadline && workDays.length < 370) {
    if (weekdays.includes(day.getDay()) && !breakDays.includes(iso(day))) workDays.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }
  if (!workDays.length) return { tasks: [], warning: "No available study days remain before the examination. Choose another date or add study days." };
  const tasks: PlannedTask[] = [];
  const loads = workDays.map(d => reserved[iso(d)] || 0);
  if (loads.some(load => load > dailyMinutes)) return { tasks: [], warning: "Completed tasks already exceed the available daily study time on a scheduled day. Adjust the plan settings." };
  const sorted = [...topics].sort((a, b) => (b.difficulty_level === "hard" ? 1 : 0) - (a.difficulty_level === "hard" ? 1 : 0));
  let cursor = 0;
  for (const topic of sorted) {
    const duration = Math.max(20, topic.estimated_minutes || 45);
    let remaining = duration;
    let nextCursor = cursor;
    for (let attempt = 0; attempt < workDays.length && remaining > 0; attempt++) {
      const index = (cursor + attempt) % workDays.length;
      const capacity = dailyMinutes - loads[index];
      if (capacity <= 0) continue;
      const segment = Math.min(capacity, remaining);
      loads[index] += segment; remaining -= segment;
      tasks.push({ topicId: topic.id, title: remaining > 0 ? `${topic.topic_name} (continued)` : topic.topic_name, type: "study", date: iso(workDays[index]), minutes: segment, priority: topic.difficulty_level === "hard" ? "high" : "normal" });
      nextCursor = (index + 1) % workDays.length;
    }
    cursor = nextCursor;
    if (remaining > 0) return { tasks, warning: `The available time cannot fit all topics. ${topic.topic_name} needs about ${remaining} more minutes. Add study days or increase daily hours.` };
  }
  const last = loads.length - 1;
  const revisionMinutes = Math.min(30, dailyMinutes);
  if (loads[last] + revisionMinutes <= dailyMinutes) tasks.push({ topicId: null, title: "Final revision and practice", type: "revision", date: iso(workDays[last]), minutes: revisionMinutes, priority: "high" });
  return { tasks, warning: null };
}
