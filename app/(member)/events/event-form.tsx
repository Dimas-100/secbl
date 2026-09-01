import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface EventFormDefaults {
  title: string;
  description: string;
  location: string;
  startsAtLocal: string;
  endsAtLocal: string;
}

// Times are club wall-clock (see lib/events.ts); the action converts on submit.
export function EventForm({
  action,
  defaults,
  submitLabel,
  eventId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults: EventFormDefaults;
  submitLabel: string;
  eventId?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {eventId && <input type="hidden" name="event_id" value={eventId} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={80} defaultValue={defaults.title} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          maxLength={120}
          defaultValue={defaults.location}
          placeholder="Where is it?"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="starts_at_local">Starts</Label>
          <Input
            id="starts_at_local"
            name="starts_at_local"
            type="datetime-local"
            required
            defaultValue={defaults.startsAtLocal}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ends_at_local">Ends (optional)</Label>
          <Input
            id="ends_at_local"
            name="ends_at_local"
            type="datetime-local"
            defaultValue={defaults.endsAtLocal}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Details</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={defaults.description} />
      </div>
      <Button type="submit" size="lg" className="w-full">
        {submitLabel}
      </Button>
      <p className="text-muted-foreground text-xs">All times are club time (Eastern).</p>
    </form>
  );
}
