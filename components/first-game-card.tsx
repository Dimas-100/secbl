import { useId } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { PlacementRow } from "@/components/progress-card";
import { GOLD_EDGE } from "@/lib/utils";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export interface FirstGameFace {
  id: string;
  display_name: string;
  avatar_url: string | null;
  ball: number | null;
}

// In place of the progress card for a member with no confirmed game (spec
// 2026-10-21-play-and-progress §2): one thing to do, no rating, rank or level
// yet. Faces open the scoreboard with that person in, as the Play sheet does.
// `eyebrow` is lib/home.ts facesEyebrow: the school only when every face is
// a schoolmate.
export function FirstGameCard({ eyebrow, faces }: { eyebrow: string; faces: FirstGameFace[] }) {
  const titleId = useId();
  const facesId = useId();
  return (
    <section aria-labelledby={titleId} className={`${GOLD_EDGE} flex flex-col gap-3`}>
      <span className="bg-brass text-background self-start rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] uppercase">
        Step 1
      </span>
      <h2 id={titleId} className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
        Play your first game
      </h2>
      <p className="text-muted-foreground text-[13px] leading-snug">
        Your first 10 games set your rating. Win or lose, every game counts toward your level.
      </p>
      <PlacementRow played={0} />
      <h3 id={facesId} className="eyebrow mt-2">
        {eyebrow}
      </h3>
      <ul aria-labelledby={facesId} className="grid grid-cols-5 gap-2">
        {faces.map((p) => (
          <li key={p.id}>
            <Link
              href={`/matches/new?opponent=${p.id}`}
              aria-label={p.display_name}
              className="press flex flex-col items-center gap-1.5"
            >
              <Avatar person={p} size="md" />
              <span className="w-full truncate text-center text-[12px] font-medium">{firstName(p.display_name)}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/matches/new?find=1" className="press flex flex-col items-center gap-1.5">
            <span className="flex size-10 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
              <Search aria-hidden="true" className="text-muted-foreground size-4" strokeWidth={1.8} />
            </span>
            <span className="text-muted-foreground text-[12px] font-medium">Other</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
