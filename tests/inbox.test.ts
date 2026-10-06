import { describe, expect, it } from "vitest";
import { buildInboxItems, inboxStamp } from "@/lib/inbox";
import type { InboxRow } from "@/lib/chat";

const now = new Date("2026-10-06T20:00:00Z"); // 4 pm ET
const row = (over: Partial<InboxRow>): InboxRow => ({
  id: "x",
  type: "dm",
  name: "",
  school_id: null,
  other_id: "o",
  other_name: "Sam Lee",
  member_count: 2,
  unread: 0,
  last_message_id: null,
  last_body: null,
  last_sender_id: null,
  last_sender_name: null,
  last_at: null,
  ...over,
});
const schools = {
  s1: { id: "s1", short_name: "GSU", primary_color: "#0039a6", logo_url: "https://x/l.png" },
};

describe("inboxStamp", () => {
  it("shows a time today and a date otherwise", () => {
    expect(inboxStamp("2026-10-06T18:05:00Z", now)).toBe("2:05 PM");
    expect(inboxStamp("2026-10-01T18:05:00Z", now)).toBe("Oct 1");
  });
});

describe("buildInboxItems", () => {
  it("titles, subtitles, previews and schools, in sorted order", () => {
    const items = buildInboxItems(
      [
        row({
          id: "dm",
          last_body: "gg",
          last_sender_id: "me",
          last_sender_name: "Me",
          last_at: "2026-10-06T18:05:00Z",
        }),
        row({
          id: "room",
          type: "school",
          name: "GSU",
          school_id: "s1",
          member_count: 9,
          last_body: "tonight?",
          last_sender_id: "o",
          last_sender_name: "Sam Lee",
          last_at: "2026-10-06T19:00:00Z",
        }),
        row({ id: "all", type: "everyone", name: "Everyone", member_count: 40 }),
      ],
      { meId: "me", now, schoolsById: schools }
    );
    expect(items.map((i) => i.id)).toEqual(["room", "dm", "all"]);
    expect(items[0]).toMatchObject({
      title: "GSU",
      subtitle: "GSU room · 9 members",
      preview: "Sam Lee: tonight?",
      stamp: "3:00 PM",
      school: schools.s1,
    });
    expect(items[1]).toMatchObject({ title: "Sam Lee", subtitle: "Direct message", preview: "You: gg", school: null });
    expect(items[2]).toMatchObject({ title: "Everyone", subtitle: "40 members", preview: null, stamp: null });
  });
});
