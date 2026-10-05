// Skeleton shown while a member page's data loads: the hero band and two
// cards, in the shapes every page shares, so navigation never flashes blank.
export default function MemberLoading() {
  return (
    <main aria-busy="true" aria-label="Loading">
      <div className="hero-gradient -mx-4 rounded-b-2xl px-5 pt-4 pb-7">
        <div className="h-5 w-32 animate-pulse rounded bg-white/25" />
        <div className="mt-3 h-10 w-24 animate-pulse rounded bg-white/20" />
      </div>
      <div className="-mt-3 flex flex-col gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-card flex flex-col gap-3 rounded-xl p-5 shadow-[var(--shadow-card)]"
          >
            <div className="bg-muted h-3 w-24 animate-pulse rounded" />
            <div className="bg-muted h-4 w-full animate-pulse rounded" />
            <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
            <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </main>
  );
}
