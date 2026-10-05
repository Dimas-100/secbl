"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { PenSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { startDm } from "./actions";

export interface Person {
  id: string;
  display_name: string;
  school: string | null;
}

// The same bottom-sheet picker the report form uses for opponents: search on
// top (the only keyboard), big tappable rows underneath. Each row is its own
// form so the tap goes straight to the server action.
export function NewMessageSheet({ people }: { people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = people.filter((p) =>
    p.display_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="hero">
          <PenSquare className="size-4" />
          New message
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-background fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-3 rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <Dialog.Title className="text-sm font-bold">Message a member</Dialog.Title>
          <Input
            autoFocus
            placeholder="Search members"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search members"
          />
          <div className="flex flex-col overflow-y-auto">
            {filtered.map((p) => (
              <form key={p.id} action={startDm} className="contents">
                <input type="hidden" name="profile_id" value={p.id} />
                <SubmitButton
                  variant="ghost"
                  className="h-auto min-h-12 justify-between rounded-lg px-2 text-left text-sm font-medium"
                  pendingChildren={<span className="text-muted-foreground">Opening…</span>}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                      {p.display_name[0]?.toUpperCase()}
                    </span>
                    <span className="truncate">{p.display_name}</span>
                  </span>
                  {p.school && <Badge variant="secondary">{p.school}</Badge>}
                </SubmitButton>
              </form>
            ))}
            {filtered.length === 0 && (
              <p className="text-muted-foreground p-2 text-sm">No members match.</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
