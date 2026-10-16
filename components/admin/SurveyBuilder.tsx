"use client";

import { surveyQuestionTypeOptions } from "@/lib/admin/survey-resources";
import { useAdmin } from "./AdminProvider";
import { ChildEditor } from "./Builders";
import { Badge } from "./ui";

/** Question builder of a survey: add / edit / delete and drag-reorder (same ChildEditor as the quiz and psych builders). */
export function SurveyQuestions({ surveyId }: { surveyId: string | number }) {
  const { L } = useAdmin();
  return (
    <ChildEditor
      resKey="survey_questions"
      parentId={surveyId}
      summary={(r) => {
        const opt = surveyQuestionTypeOptions.find((o) => o.value === r.type);
        return (
          <span className="hidden items-center gap-1.5 sm:flex">
            <Badge tone={opt?.tone ?? "gray"}>{opt ? L(opt.label) : String(r.type)}</Badge>
            {r.required ? <Badge tone="red">*</Badge> : null}
          </span>
        );
      }}
    />
  );
}
