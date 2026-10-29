import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Character } from "@/components/character";
import { CharacterBuilder } from "@/components/character-builder";
import { CharacterAvatar, CharacterFigure } from "@/components/character-face";
import { FlameMark } from "@/components/flame-mark";
import { ListRow } from "@/components/list-row";
import { MatchRow } from "@/components/match-row";
import { SectionHeading } from "@/components/section-heading";
import { TitleBadge } from "@/components/title-badge";
import { COSTUMES, CUES, OUTFITS, characterPreviewEnabled, starterLook, type Progress } from "@/lib/character";
import { TITLES, type TitleName } from "@/lib/levels";
import { cn } from "@/lib/utils";

// A look at characters with invented members, for building them without
// touching the club: no sign-in, no database, nothing written. Only while the
// characters switch is on, and never in production.
export const metadata = { title: "Characters preview · SECBL" };

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = (n: number, name: string, ball: number) => ({ id: id(n), display_name: name, ball, avatar_url: null });

const ME = P(1, "You", 6);
const PEOPLE = [
  P(2, "Player A", 2),
  P(3, "Player B", 3),
  P(4, "Player C", 4),
  P(5, "Player D", 5),
  P(6, "Player E", 1),
  P(7, "Player F", 7),
  P(8, "Player G", 8),
  P(9, "Player H", 10),
];

const CORNER = "ring-background absolute -right-1.5 -bottom-1.5 rounded-full ring-2";

export default async function CharacterPreview({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; cup?: string; season?: string; streak?: string; night?: string }>;
}) {
  if (!characterPreviewEnabled()) notFound();
  const q = await searchParams;
  const title = (TITLES.find((t) => t.name === q.title)?.name ?? "Rookie") as TitleName;
  const progress: Progress = {
    title,
    cupsWon: q.cup ? 1 : 0,
    seasonsWon: q.season ? 1 : 0,
    bestStreak: q.streak ? 5 : 0,
    nightsOpened: q.night ? 1 : 0,
  };
  const [a, b, c, d, e, f, g, h] = PEOPLE;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pt-8 pb-24">
      <header className="flex flex-col gap-2">
        <span className="eyebrow text-muted-foreground">Preview only</span>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Characters</h1>
        <p className="text-muted-foreground text-[14px]">
          Invented members, the real app components. Nothing here reads or writes club data.
        </p>
      </header>

      <section className="flex flex-col gap-1.5">
        <SectionHeading>Recent</SectionHeading>
        <MatchRow winner={ME} loser={a} winnerScore={5} loserScore={3} delta={14} viewerId={ME.id} perspectiveId={ME.id} gameType="8-ball" format="1 spot" stamp="2h" />
        <ListRow
          leading={
            <span className="relative flex">
              <Avatar person={b} size="md" />
              <TitleBadge title="Shark" size={20} decorative className={CORNER} />
            </span>
          }
          title="Player B is now a Shark"
          meta="Level 10 · badge unlocked"
          trailing={<span className="text-muted-foreground text-[12px]">3h</span>}
        />
        <MatchRow winner={c} loser={d} winnerScore={7} loserScore={4} delta={null} viewerId={ME.id} gameType="9-ball" stamp="5h" />
        <ListRow
          leading={
            <span className="relative flex">
              <Avatar person={e} size="md" />
              <FlameMark size={20} className={`bg-background p-0.5 ${CORNER}`} />
            </span>
          }
          title="Player E is on a 5-game win streak"
          meta="Rating ladder"
          trailing={<span className="text-muted-foreground text-[12px]">5h</span>}
        />
        <MatchRow winner={f} loser={ME} winnerScore={5} loserScore={2} delta={11} viewerId={ME.id} perspectiveId={ME.id} gameType="8-ball" stamp="Yesterday" />
        <ListRow
          leading={<Avatar person={g} size="md" ring="var(--gold)" />}
          title="Player G won the Fall Cup"
          meta="Champion"
          trailing={<span className="text-muted-foreground text-[12px]">Oct 26</span>}
        />
        <ListRow
          leading={<Avatar person={h} size="md" />}
          title="Player H joined"
          trailing={<span className="text-muted-foreground text-[12px]">Oct 25</span>}
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Ranks</SectionHeading>
        {[ME, a, b, c, d].map((p, i) => (
          <ListRow
            key={p.id}
            leading={
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground stat-number w-4 text-[13px]">{i + 1}</span>
                <Avatar person={p} size="sm" />
              </span>
            }
            title={p.display_name}
            meta={`${12 - i}–${3 + i}`}
            trailing={<span className="stat-number text-[15px]">{512 - i * 17}</span>}
          />
        ))}
      </section>

      <section className="flex flex-col items-center gap-3">
        <SectionHeading>Profile</SectionHeading>
        <CharacterFigure id={ME.id} ball={ME.ball} progress={progress} label="Your character" />
        <span className="text-[28px] leading-[1.1] font-semibold tracking-[-0.025em]">You</span>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Starters</SectionHeading>
        <p className="text-muted-foreground text-[13px]">
          What sixteen members get before they open the builder: one per ball colour, picked from their id.
        </p>
        <div className="grid grid-cols-4 gap-x-3 gap-y-6 pt-3 sm:grid-cols-8">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className="mx-auto block size-16">
              <CharacterAvatar look={starterLook(id(100 + i), (i % 15) + 1)} className="size-full" />
            </span>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="bg-card flex aspect-[3/5] items-end justify-center rounded-2xl p-1 shadow-[0_0_0_1px_var(--hairline)]">
              <Character look={starterLook(id(100 + i), (i % 15) + 1)} view="full" className="h-full w-full" />
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>The ladder</SectionHeading>
        <p className="text-muted-foreground text-[13px]">Each title badge brings a cue and an outfit.</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {TITLES.map((t, i) => {
            const outfit = OUTFITS.find((o) => o.earn?.kind === "title" && o.earn.title === t.name)?.id ?? "classic";
            return (
              <span key={t.name} className="bg-card flex flex-col items-center gap-1 rounded-2xl p-2 shadow-[0_0_0_1px_var(--hairline)]">
                <Character
                  look={{ ...starterLook(id(200 + i), i + 2), outfit, cue: CUES[i].id, hat: "none" }}
                  view="full"
                  className="aspect-[3/5] w-full"
                />
                <TitleBadge title={t.name} size={20} decorative />
                <span className="text-[12px] font-medium">{t.name}</span>
              </span>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Costumes</SectionHeading>
        <p className="text-muted-foreground text-[13px]">Head-to-toe dress-up, free for everyone.</p>
        <div className="grid grid-cols-5 gap-x-2 gap-y-6 pt-4">
          {COSTUMES.map((c, i) => (
            <span key={c.id} className="mx-auto block size-14">
              <CharacterAvatar look={{ ...starterLook(id(300 + i), (i % 15) + 1), outfit: c.id, outfitColor: i % 2 ? "purple" : "blue" }} className="size-full" />
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {COSTUMES.map((c, i) => (
            <span key={c.id} className="bg-card flex flex-col items-center gap-1 rounded-2xl p-2 shadow-[0_0_0_1px_var(--hairline)]">
              <Character
                look={{ ...starterLook(id(300 + i), (i % 15) + 1), outfit: c.id, outfitColor: i % 2 ? "purple" : "blue" }}
                view="full"
                crop="0 -10 120 210"
                className="aspect-[4/7] w-full"
              />
              <span className="text-[12px] font-medium">{c.label}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Builder</SectionHeading>
        <nav aria-label="Pretend progress" className="flex flex-wrap gap-2 text-[12px]">
          {TITLES.map((t) => (
            <Link
              key={t.name}
              href={`?title=${t.name}${q.cup ? "&cup=1" : ""}${q.season ? "&season=1" : ""}${q.streak ? "&streak=1" : ""}${q.night ? "&night=1" : ""}`}
              className={cn("rounded-full px-3 py-1.5 shadow-[0_0_0_1px_var(--hairline-strong)]", t.name === title && "bg-secondary")}
            >
              {t.name}
            </Link>
          ))}
          <Link href={`?title=${title}&cup=1&season=1&streak=1&night=1`} className="rounded-full px-3 py-1.5 shadow-[0_0_0_1px_var(--hairline-strong)]">
            + everything earned
          </Link>
        </nav>
        <CharacterBuilder memberId={ME.id} ball={ME.ball} progress={progress} />
      </section>
    </div>
  );
}
