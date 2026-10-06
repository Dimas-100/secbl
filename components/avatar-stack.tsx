import { Avatar, type AvatarIdentity } from "@/components/avatar";
import { cn } from "@/lib/utils";

// Overlapping 30px avatars with a caption ("You + 14 going"). Each sits in a
// 2px card-coloured gap so the stack reads inside a card.
export function AvatarStack({
  people,
  max = 4,
  caption,
}: {
  people: AvatarIdentity[];
  max?: number;
  caption?: string;
}) {
  const shown = people.slice(0, max);
  return (
    <div className="flex min-w-0 items-center">
      {shown.length > 0 && (
        <div className="flex shrink-0">
          {shown.map((p, i) => (
            <Avatar key={p.id} person={p} size="xs" className={cn("ring-card ring-2", i > 0 && "-ml-2")} />
          ))}
        </div>
      )}
      {caption && (
        <span className={cn("text-muted-foreground truncate text-[13px]", shown.length > 0 && "ml-[18px]")}>
          {caption}
        </span>
      )}
    </div>
  );
}
