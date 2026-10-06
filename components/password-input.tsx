"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

// A password field with a show/hide toggle: on a phone, seeing what you typed
// is the difference between one attempt and three.
export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="text-muted-foreground press absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full"
      >
        {shown ? <EyeOff className="size-[18px]" strokeWidth={1.7} /> : <Eye className="size-[18px]" strokeWidth={1.7} />}
      </button>
    </div>
  );
}
