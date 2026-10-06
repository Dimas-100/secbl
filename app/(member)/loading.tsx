// Skeleton while a member page loads: a header line, a hero number, a stat
// row and three hairline rows — the shapes every screen shares.
export default function MemberLoading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="flex flex-col gap-7 pt-3">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <div className="bg-card h-3 w-24 animate-pulse rounded" />
          <div className="bg-card h-8 w-40 animate-pulse rounded" />
        </div>
        <div className="bg-card size-11 animate-pulse rounded-full" />
      </div>
      <div className="bg-card h-16 w-32 animate-pulse rounded" />
      <div className="border-hairline-divider grid grid-cols-3 gap-4 border-t pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-card h-10 animate-pulse rounded" />
        ))}
      </div>
      <div className="flex flex-col">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-hairline-row flex items-center gap-3.5 border-b py-3.5">
            <div className="bg-card size-10 animate-pulse rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="bg-card h-3.5 w-1/2 animate-pulse rounded" />
              <div className="bg-card h-3 w-1/3 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
