import { describe, expect, it } from "vitest";
import {
  dmKey,
  filterInbox,
  formatMessageTime,
  groupByDay,
  mergeMessages,
  previewOf,
  sortInbox,
  type ChatMessage,
  type InboxRow,
} from "@/lib/chat";

const msg = (id: number, iso: string, sender = "a", body = "hi"): ChatMessage => ({
  id,
  channel_id: "c",
  sender_id: sender,
  body,
  created_at: iso,
});

describe("dmKey", () => {
  it("is the same for either ordering of the pair", () => {
    expect(dmKey("b", "a")).toBe("a:b");
    expect(dmKey("a", "b")).toBe("a:b");
  });
});

describe("sortInbox", () => {
  const row = (over: Partial<InboxRow>): InboxRow => ({
    id: "x",
    type: "dm",
    name: "",
    school_id: null,
    other_id: null,
    other_name: null,
    member_count: 2,
    unread: 0,
    last_message_id: null,
    last_body: null,
    last_sender_id: null,
    last_sender_name: null,
    last_at: null,
    ...over,
  });

  it("pins Everyone, then the school room, then DMs by latest activity", () => {
    const rows = [
      row({ id: "dm-old", last_at: "2026-10-01T00:00:00Z" }),
      row({ id: "school", type: "school", name: "GSU", last_at: "2026-10-05T00:00:00Z" }),
      row({ id: "dm-new", last_at: "2026-10-04T00:00:00Z" }),
      row({ id: "everyone", type: "everyone", name: "Everyone", last_at: null }),
      row({ id: "dm-quiet", last_at: null }),
    ];
    expect(sortInbox(rows).map((r) => r.id)).toEqual([
      "everyone",
      "school",
      "dm-new",
      "dm-old",
      "dm-quiet",
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [row({ id: "b" }), row({ id: "a", type: "everyone" })];
    sortInbox(rows);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("mergeMessages", () => {
  it("appends new messages in id order and drops duplicates", () => {
    const have = [msg(1, "2026-10-05T10:00:00Z"), msg(2, "2026-10-05T10:01:00Z")];
    const incoming = [msg(2, "2026-10-05T10:01:00Z"), msg(3, "2026-10-05T10:02:00Z")];
    expect(mergeMessages(have, incoming).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("replaces an optimistic (negative id) message when its real row arrives", () => {
    const have = [msg(1, "2026-10-05T10:00:00Z"), { ...msg(-5, "2026-10-05T10:03:00Z"), client_id: "tmp" }];
    const real = { ...msg(7, "2026-10-05T10:03:01Z"), client_id: "tmp" };
    const merged = mergeMessages(have, [real]);
    expect(merged.map((m) => m.id)).toEqual([1, 7]);
  });

  it("keeps optimistic messages after everything confirmed", () => {
    const have = [{ ...msg(-1, "2026-10-05T10:05:00Z"), client_id: "p" }];
    const merged = mergeMessages(have, [msg(4, "2026-10-05T10:04:00Z")]);
    expect(merged.map((m) => m.id)).toEqual([4, -1]);
  });
});

describe("groupByDay", () => {
  it("splits by club calendar day and labels Today / Yesterday", () => {
    const now = new Date("2026-10-05T18:00:00Z"); // 2pm club time
    const messages = [
      msg(1, "2026-10-04T03:00:00Z"), // Oct 3 11pm club — two days ago
      msg(2, "2026-10-05T01:00:00Z"), // Oct 4 9pm club — yesterday
      msg(3, "2026-10-05T15:00:00Z"), // Oct 5 11am club — today
      msg(4, "2026-10-05T16:00:00Z"),
    ];
    const groups = groupByDay(messages, now);
    expect(groups.map((g) => g.label)).toEqual(["Sat, Oct 3", "Yesterday", "Today"]);
    expect(groups[2].messages.map((m) => m.id)).toEqual([3, 4]);
  });

  it("returns nothing for no messages", () => {
    expect(groupByDay([], new Date())).toEqual([]);
  });
});

describe("formatMessageTime", () => {
  it("renders club wall-clock time", () => {
    expect(formatMessageTime("2026-10-05T15:07:00Z")).toBe("11:07 AM");
  });
});

describe("previewOf", () => {
  it("prefixes the sender for group rooms and shortens long bodies", () => {
    expect(previewOf({ body: "see you at 7", senderName: "Dimas", mine: false, group: true })).toBe(
      "Dimas: see you at 7"
    );
    expect(previewOf({ body: "see you at 7", senderName: "Dimas", mine: true, group: true })).toBe(
      "You: see you at 7"
    );
    expect(previewOf({ body: "x".repeat(100), senderName: "D", mine: false, group: false })).toBe(
      "x".repeat(59) + "…"
    );
  });

  it("collapses newlines so one row stays one line", () => {
    expect(previewOf({ body: "a\nb\n\nc", senderName: "D", mine: false, group: false })).toBe("a b c");
  });
});

describe("filterInbox", () => {
  const row = (over: Partial<InboxRow>): InboxRow => ({
    id: "x",
    type: "dm",
    name: "",
    school_id: null,
    other_id: null,
    other_name: null,
    member_count: 2,
    unread: 0,
    last_message_id: null,
    last_body: null,
    last_sender_id: null,
    last_sender_name: null,
    last_at: null,
    ...over,
  });
  const rows = [
    row({ id: "e", type: "everyone", name: "Everyone" }),
    row({ id: "s", type: "school", name: "GSU" }),
    row({ id: "d", type: "dm", name: "", other_name: "Kevin Moss" }),
  ];
  it("splits direct from rooms", () => {
    expect(filterInbox(rows, "direct", "").map((r) => r.id)).toEqual(["d"]);
    expect(filterInbox(rows, "schools", "").map((r) => r.id)).toEqual(["e", "s"]);
    expect(filterInbox(rows, "all", "").map((r) => r.id)).toEqual(["e", "s", "d"]);
  });
  it("searches the visible title, case-insensitively", () => {
    expect(filterInbox(rows, "all", "kev").map((r) => r.id)).toEqual(["d"]);
    expect(filterInbox(rows, "all", "gsu").map((r) => r.id)).toEqual(["s"]);
    expect(filterInbox(rows, "all", "zzz")).toEqual([]);
  });
});
