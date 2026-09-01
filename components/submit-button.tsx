"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Server Actions give zero built-in feedback while in flight -- a plain
// submit button just sits there, clickable, for as long as the action's
// network round trips take. On a slow or multi-query action (e.g. a
// tournament result, which reads the match, replays the ladder, then writes)
// that window is long enough for an admin -- or an automated test -- to
// resubmit the same not-yet-updated form before the first result ever
// renders. Disabling the button while its enclosing form is pending closes
// that window: useFormStatus flips synchronously when submission starts, so
// there is no gap during which a second click can land.
export function SubmitButton({
  children,
  pendingChildren,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingChildren?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (pendingChildren ?? children) : children}
    </Button>
  );
}
