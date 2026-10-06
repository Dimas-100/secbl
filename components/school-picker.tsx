"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { SchoolMark, type SchoolMarkSchool } from "@/components/school-mark";
import { cn } from "@/lib/utils";

export interface PickableSchool extends SchoolMarkSchool {
  id: string;
  name: string;
}

// Pick your school by tapping its mark — a radio group that looks like the
// league. Submits as `school_id` like the old <select> did. Tested by
// e2e/signup-flow.spec.ts.
export function SchoolPicker({
  schools,
  name = "school_id",
  defaultValue = null,
}: {
  schools: PickableSchool[];
  name?: string;
  defaultValue?: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(
    defaultValue && schools.some((s) => s.id === defaultValue) ? defaultValue : null
  );
  const chosen = schools.find((s) => s.id === picked) ?? null;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="eyebrow mb-2">Your school</legend>
      <div role="radiogroup" aria-label="School" className="grid grid-cols-5 gap-2">
        {schools.map((s) => {
          const on = s.id === picked;
          return (
            <label
              key={s.id}
              className={cn(
                "press bg-card flex cursor-pointer flex-col items-center gap-2 rounded-[16px] py-3 text-[11px] font-medium shadow-[inset_0_0_0_1px_var(--hairline-row)]",
                on ? "text-foreground shadow-[inset_0_0_0_2px_var(--brass)]" : "text-muted-foreground"
              )}
            >
              <input
                type="radio"
                name={name}
                value={s.id}
                checked={on}
                onChange={() => setPicked(s.id)}
                required
                aria-label={s.name}
                className="sr-only"
              />
              <span className="relative">
                <SchoolMark school={s} size={40} />
                {on && (
                  <span className="bg-brass text-background ring-card absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              {s.short_name}
            </label>
          );
        })}
      </div>
      <p aria-live="polite" className="text-muted-foreground min-h-4 text-[12px]">
        {chosen ? chosen.name : "Tap your school."}
      </p>
    </fieldset>
  );
}
