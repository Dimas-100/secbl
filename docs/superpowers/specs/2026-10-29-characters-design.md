# Characters

Status: built on `feat/characters` (2026-10-29); ships when migration 0033 is applied and `NEXT_PUBLIC_CHARACTERS=1`
is set in Vercel.

## What

Every member gets a pool-hall character in the "Pool hall classic" style (owner's pick, 2026-10-27 brainstorm). It
replaces the round photo / ball everywhere `components/avatar.tsx` draws a face (Recent, Ranks, chat, Live now, the
opponent picker, …), and the Profile shows the whole figure with the cue. Members build their own, piece by piece,
like Duolingo's avatar builder (`/settings/character`).

Duolingo is the reference (owner, 2026-10-29):

- The avatar is a coloured backdrop circle with head and shoulders in it, the head rising a little past the circle's
  top edge. The backdrop is the member's choice; a starter's is their ball colour.
- Soft volume: gradients lit from the upper left on skin, hair and clothes, eyes with whites, an iris colour and
  highlights.
- The builder has two rooms. **Avatar**, in this order: skin tone, face shape, eye colour, expression, hair colour,
  hairstyle, glasses, facial hair colour, facial hair, headwear colour, headwear, earrings, background. **Closet**:
  outfits (each a whole look; the club classic is tailored piece by piece: top, layer, neckwear and their colours),
  trousers, cue, gear, and the unlock ladder.
- Expressions are whole (eyes, brows and mouth together): Happy, Beaming, Laughing, Calm, Cool, Cheeky, Focused,
  Surprised.
- Body shape and feminine options (owner asked for "a female", 2026-10-29), all free: **Body shape** Straight or
  Curvy (the same drawing clipped to a narrower-shouldered, waisted torso with slimmer arms, so every outfit and
  costume fits both; labelled by shape, not gender), **Eyelashes**, **Lip colour** (natural, rose, red), a **Skirt**
  next to trousers in the Closet (bare legs, in the bottoms colour; suits and costumes keep their own), and two more
  hairstyles (long curls, space buns). Starters stay on the straight figure with no lashes or lip colour, in trousers:
  the house kit assigns no gender.
- **Start from: Male / Female** (owner, 2026-10-29), at the top of the Avatar room: a quick start, not a rule.
  Neither is picked until the member taps one (starters are "none", so no one is assigned a gender); a tap applies a
  bundle (`applyPreset`: Female = curvy, lashes, skirt, long hair if theirs is short; Male = straight, no lashes or
  lip colour, trousers, a crop if their hair is long; hair that suits either stays), the choice is saved with the
  look, and every piece stays changeable with nothing hidden.
- Costumes, Duolingo's dress-up (owner, 2026-10-29), in the Closet after the outfits, each with its own headwear and
  props. A costume is worn in the outfit slot and takes off the member's hat, except a headscarf, which stays on
  unless the costume brings headwear of its own. Drawn in `components/character-costumes.tsx`. Three are free; the
  rest come with the profile's achievements (lib/achievements.ts, never lost), see Unlocks.

## Pieces

- `lib/character.ts`: the catalogue (skins, hair, faces, clothes, outfits, hats, extras, gear, cues), the unlock
  rules, the starter, `randomLook`, and `sanitizeLook`, which turns any stored value back into a valid look and swaps
  out anything the member hasn't earned.
- `components/character.tsx`: the drawing. One 120×200 layered SVG; `full` for the Profile and builder, `pop` for the
  avatar (clipped to the circle below and to the head's width above), `bust` for builder tiles. Gradient ids come
  from `useId`, so a page can hold any number.
- `components/character-face.tsx`: the avatar and Profile wrappers, and the stored-look reader.
- `components/character-builder.tsx`: the builder.
- `lib/character-data.ts`: a member's progress, read from what the app already records.
- `app/character-preview`: invented members in the real components; no sign-in, no database.

## Starters (members who never open the builder)

The house kit, picked from the member id with a seeded generator so it never changes between screens. A starter says
nothing about the person wearing it, because nobody chose it (owner, 2026-10-29): everyone gets the neutral **chalk**
skin (a pale pool-chalk blue that is plainly nobody's skin), the same dark eyes, and a club cap with no hair under it,
so the app never assigns a skin tone, an eye colour or a hairstyle. Starters vary only in what anyone might wear: the
ball colour as the backdrop (the colour people already know them by), cap style and colour, shirt, vest, bow or tie,
a friendly expression (Happy, Beaming or Calm), sometimes glasses. Never facial hair, earrings, shades, chain,
toothpick or a headscarf, and nothing is guessed from a name. Chalk is also the first swatch in the builder, for anyone
who wants to keep it; the human tones are numbered, never named.

## Unlocks

Cues and the title outfits climb with the title badges (XP-based, never lost); four parts are won:

| Earned by | Unlocks |
|---|---|
| Rookie (level 1) | House cue |
| Regular (5) | Regular's maple cue, Bowling shirt |
| Shark (10) | Shark's steel cue, Leather jacket |
| Hustler (15) | Hustler's ebony cue, Pinstripe suit |
| Master (25) | Master's carbon cue, Tuxedo |
| Legend (40) | Legend's pearl cue, Legend's white tux |
| Winning a cup | Cup winner's jacket |
| Winning a season | Champion's pin |
| 5 wins in a row (best streak) | Flame bow tie |
| Opening a club night | House-pro towel |
| First win | Superhero costume |
| 10 confirmed games | Cowboy costume |
| A shutout (a race won without dropping a game) | Pirate costume |
| Beating someone rated 50+ above you | Astronaut costume |
| 25 confirmed games | Wizard costume |
| Reaching a 500 rating (best ever) | Tiger onesie |
| Reaching a 600 rating (best ever) | Dino onesie |

Free from day one: every face, skin, hair and colour, tops, vest/suspenders, bow/tie, the Varsity, Island, Denim and
Track outfits, the Referee, Chef and Graduate costumes, every hat (flat cap, fedora, beanie, ball cap, bucket, headband, headscarf), glasses, earrings, chain,
headphones, glove, toothpick. A starter carries the best cue its member has reached.

## Saving and showing

- `profiles.look` (migration `0033_profile_look.sql`): the saved look, null for a starter. Only the app server
  writes it (service role) in `app/(member)/settings/character/actions.ts`, after `sanitizeLook` against the
  member's real progress (`loadCharacterProgress`); members have no update policy on profiles, so a locked part
  can't be written around the builder.
- The member shell loads every saved look once (`loadLooks`, a few hundred bytes per member who built one) into
  `LooksProvider`; every avatar reads it, so no avatar query had to change. Saving revalidates the layout.
- Photos: with characters on, the character is the face everywhere; a member's uploaded photo stays, small,
  beside their name on the Profile so people can spot each other at the hall.
- Home shows a "Make your character" card to a member still on their starter (gone once they save, or waved off
  per device).

## The switch

`charactersEnabled()`: on where `NEXT_PUBLIC_CHARACTERS=1`. Off, the app is exactly as before and
`/settings/character` is a 404. `/character-preview` (invented members, no data) is never served in production.

## Later

- Unlock announcements (the result-moment card when a title brings a new cue or outfit).
