import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { LevelBar } from "@/components/level-bar";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { createClient } from "@/lib/supabase/server";
import { TITLES, WEEKLY_PAIR_CAP, XP_FINAL_BONUS, XP_LOSS, XP_WIN, xpToReach } from "@/lib/levels";
import { loadXp } from "@/lib/xp-data";
import { cn } from "@/lib/utils";

const EARNING: [string, string][] = [
  ["Confirmed match, won", `+${XP_WIN}`],
  ["Confirmed match, lost", `+${XP_LOSS}`],
  ["Tournament match, won / lost", `+${XP_WIN} / +${XP_LOSS}`],
  ["Tournament final won", `+${XP_FINAL_BONUS} bonus`],
];

// The six titles top to bottom with this member's place on them, then how
// XP is earned. Hairline rows and the brass accent, as on the profile.
export default async function LadderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: profile }, { xp, level }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").eq("id", id).single(),
    loadXp(supabase, id),
    supabase.auth.getUser(),
  ]);
  if (!profile) notFound();
  const isMe = auth.user?.id === id;
  const who = isMe ? "You" : profile.display_name.split(" ")[0];

  return (
    <main className="flex flex-col gap-8">
      <PageHeader title="Ladder" back={`/players/${id}`} trailing={null} />

      <section className="flex flex-col gap-1.5">
        <span className="eyebrow">
          {who} · {xp.total.toLocaleString("en-US")} XP
        </span>
        <h2 className="text-[28px] leading-[1.1] font-semibold tracking-[-0.025em]">
          Level {level.level} <span className="text-brass font-medium">· {level.title}</span>
        </h2>
      </section>

      <ol className="flex flex-col">
        {TITLES.map((t, i) => {
          const next = TITLES[i + 1];
          const range = next ? `${t.from}–${next.from - 1}` : `${t.from}+`;
          const reached = level.level >= t.from;
          const current = t.name === level.title;
          return (
            <li
              key={t.name}
              className={cn(
                "border-hairline-row flex flex-col gap-3 border-b py-4",
                current && "bg-card -mx-3 rounded-[14px] border-b-transparent px-3"
              )}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    reached ? "bg-brass text-background" : "shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
                  )}
                >
                  {reached && !current && <Check className="size-3.5" strokeWidth={2.2} />}
                  {current && <span className="bg-background size-2 rounded-full" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className={cn("text-[15px] font-medium", !reached && "text-muted-foreground")}>
                    {t.name}
                  </span>
                  <span className="text-muted-foreground text-[12px]">Levels {range}</span>
                </span>
                <span className="text-muted-foreground stat-number shrink-0 text-[13px]">
                  {current
                    ? `Level ${level.level}`
                    : reached
                      ? "Reached"
                      : `${xpToReach(t.from).toLocaleString("en-US")} XP to reach`}
                </span>
              </div>
              {current && (
                <div className="flex flex-col gap-2 pl-[38px]">
                  <LevelBar value={level.intoLevel} max={level.needed} />
                  <span className="text-muted-foreground text-[12px]">
                    {level.intoLevel} / {level.needed} XP to level {level.level + 1}
                    {level.nextTitle &&
                      ` · ${level.levelsToNextTitle} level${level.levelsToNextTitle === 1 ? "" : "s"} to ${level.nextTitle}`}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <section className="flex flex-col gap-1.5">
        <SectionHeading>Earning XP</SectionHeading>
        {EARNING.map(([label, value]) => (
          <div key={label} className="border-hairline-row flex items-center justify-between gap-3 border-b py-3.5">
            <span className="text-[15px]">{label}</span>
            <span className="stat-number text-[15px]">{value}</span>
          </div>
        ))}
        <p className="text-muted-foreground pt-3 text-[13px] leading-normal">
          Only the first {WEEKLY_PAIR_CAP} confirmed matches against the same opponent in a club week (Monday to
          Sunday) earn XP, for both of you. Later ones still count for rating and your record. Pending, rejected
          and disputed matches earn nothing, and levels never go down.
        </p>
      </section>
    </main>
  );
}
