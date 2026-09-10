// Project budget hours are rolled up bottoms-up from task estimates rather
// than entered top-down on the project — see spec change: "project hours
// should come from the task level."
export function sumEstimatedHours(tasks: { estimatedHours: number | null }[]): number {
  const total = tasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
  return Math.round(total * 100) / 100;
}
