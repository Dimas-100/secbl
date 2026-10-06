/* eslint-disable @next/next/no-img-element */
import { BrandLogo } from "@/components/brand-logo";
import { SchoolMark } from "@/components/school-mark";
import { createClient } from "@/lib/supabase/server";
import { qrDataUri, siteOrigin } from "@/lib/install";
import { PrintButton } from "./print-button";

export const metadata = { title: "SECBL invitation" };

// The invitation: a card for the table and for sharing as an image. On
// screen it is the app's dark card with light QR modules; printed, it flips
// to ink on paper (browsers drop backgrounds when printing) with a second QR
// drawn dark. Same words either way.
export default async function InstallCardPage() {
  const installUrl = `${siteOrigin()}/install`;
  const [screenQr, printQr] = await Promise.all([qrDataUri(installUrl, 320, "screen"), qrDataUri(installUrl, 320, "print")]);
  const pretty = installUrl.replace(/^https?:\/\//, "");
  const supabase = await createClient();
  const { data: schools } = await supabase
    .from("schools")
    .select("id, short_name, primary_color, logo_url")
    .order("short_name");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-10 print:min-h-0 print:max-w-none print:gap-0 print:p-0">
      <article className="bg-card flex w-full flex-col items-center gap-6 rounded-[24px] px-7 pt-9 pb-8 text-center shadow-[inset_0_0_0_1px_var(--hairline-row)] print:rounded-none print:bg-white print:text-black print:shadow-none">
        <span className="eyebrow print:text-black/60">You&apos;re invited</span>
        <BrandLogo className="h-auto w-36" />
        <h1 className="display text-[30px] leading-[1.05]">
          Track your matches.
          <br />
          Climb the ladder.
        </h1>
        <div className="flex items-center gap-3">
          {(schools ?? []).map((s) => (
            <SchoolMark key={s.id} school={s} size={36} />
          ))}
        </div>
        <div className="rounded-[20px] p-3 shadow-[inset_0_0_0_1px_var(--hairline-divider)] print:shadow-none">
          <img src={screenQr} alt={`QR code for ${installUrl}`} width={220} height={220} className="print:hidden" />
          <img src={printQr} alt="" aria-hidden="true" width={220} height={220} className="hidden print:block" />
        </div>
        <p className="stat-number text-[17px]">{pretty}</p>
        <ol className="flex w-full flex-col text-left">
          {[
            "Scan the code with your camera.",
            "Add SECBL to your home screen.",
            "Pick your school, get approved, start logging games.",
          ].map((step, i) => (
            <li
              key={step}
              className="border-hairline-row flex items-center gap-3.5 border-b py-3 text-[14px] last:border-b-0 print:border-black/10"
            >
              <span className="bg-brass text-background stat-number flex size-7 shrink-0 items-center justify-center rounded-full text-[12px]">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-[12px] print:text-black/60">
          Ratings · ranks · races · cups · chat. Five schools, one league.
        </p>
      </article>
      <PrintButton />
    </main>
  );
}
