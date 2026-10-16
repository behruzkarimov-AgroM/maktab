import type { DemoTest, PsychResult, PublicTest } from "./types";

/** Strip scores/scales so nothing scoring-related reaches the browser. */
export function toPublic(t: DemoTest): PublicTest {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    instruction: t.instruction,
    audience: t.audience,
    topic: t.topic,
    questions: t.questions.map((qq) => ({
      id: qq.id,
      text: qq.text,
      options: qq.options.map((o) => ({ id: o.id, text: o.text })),
    })),
  };
}

/** Sum option scores and match a scale. Returns null when the answers are incomplete/invalid. */
export function scoreDemo(test: DemoTest, answers: Record<string, string>): PsychResult | null {
  let total = 0;
  for (const qq of test.questions) {
    const o = qq.options.find((x) => x.id === answers[qq.id]);
    if (!o) return null;
    total += o.score;
  }
  const scale = test.scales.find((s) => total >= s.min && total <= s.max);
  if (!scale) return null;
  return {
    total_score: total,
    title: scale.title,
    analysis: scale.analysis,
    recommendations: scale.recommendations,
    badge_color: scale.badge,
  };
}
