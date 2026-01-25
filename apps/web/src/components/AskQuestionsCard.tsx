import * as React from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type Question = {
  header: string;
  question: string;
  multiSelect?: boolean;
  options?: Array<{ label: string; description?: string }>;
};

type Props = {
  questions: Question[];
  onSubmit: (answers: Record<string, string | string[]>) => void;
  disabled?: boolean;
};

export function AskQuestionsCard({ questions, onSubmit, disabled }: Props) {
  const [answers, setAnswers] = React.useState<Record<string, string | string[]>>(
    {},
  );

  function updateAnswer(header: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [header]: value }));
  }

  return (
    <Card className="border-slate-700 bg-slate-950/60">
      <CardHeader>
        <CardTitle>Questions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((q) => {
          const current = answers[q.header];
          return (
            <div key={q.header} className="space-y-2">
              <div className="text-sm font-medium">{q.question}</div>

              {q.options?.length ? (
                <div className="space-y-2">
                  {q.multiSelect ? (
                    <div className="space-y-1">
                      {q.options.map((opt) => {
                        const selected = Array.isArray(current)
                          ? current.includes(opt.label)
                          : false;
                        return (
                          <label
                            key={opt.label}
                            className="flex items-start gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={selected}
                              onChange={(e) => {
                                const next = new Set(
                                  Array.isArray(current) ? current : [],
                                );
                                if (e.target.checked) next.add(opt.label);
                                else next.delete(opt.label);
                                updateAnswer(q.header, Array.from(next));
                              }}
                            />
                            <span>
                              <span className="font-medium">{opt.label}</span>
                              {opt.description ? (
                                <span className="text-slate-400">
                                  {" "}
                                  — {opt.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt) => {
                        const selected = current === opt.label;
                        return (
                          <Button
                            key={opt.label}
                            type="button"
                            disabled={disabled}
                            variant={selected ? "default" : "secondary"}
                            onClick={() => updateAnswer(q.header, opt.label)}
                          >
                            {opt.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <input
                  disabled={disabled}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                  value={typeof current === "string" ? current : ""}
                  onChange={(e) => updateAnswer(q.header, e.target.value)}
                />
              )}
            </div>
          );
        })}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => onSubmit(answers)}
          >
            Submit answers
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
