import { notFound, redirect } from "next/navigation";
import { CharacterBuilder } from "@/components/character-builder";
import { PageHeader } from "@/components/page-header";
import { charactersEnabled } from "@/lib/character";
import { loadCharacterProgress } from "@/lib/character-data";
import { ballFor } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { saveLook } from "./actions";

// Build your character (docs/superpowers/specs/2026-10-29-characters-design.md).
// Only while the characters switch is on. Saving goes through ./actions.ts.
export default async function CharacterPage() {
  if (!charactersEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, progress] = await Promise.all([
    supabase.from("profiles").select("ball").eq("id", user.id).single(),
    loadCharacterProgress(supabase, user.id),
  ]);

  return (
    <main>
      <PageHeader title="Your character" back="/settings" trailing={null} />
      <div className="mt-6">
        <CharacterBuilder
          memberId={user.id}
          ball={ballFor(profile?.ball, user.id).number}
          progress={progress}
          onSave={saveLook}
        />
      </div>
    </main>
  );
}
