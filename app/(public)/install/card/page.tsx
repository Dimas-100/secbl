/* eslint-disable @next/next/no-img-element */
import { BrandLogo } from "@/components/brand-logo";
import { qrDataUri, siteOrigin } from "@/lib/install";
import { PrintButton } from "./print-button";

export const metadata = { title: "SECBL table card" };

// A printable card for club nights: big code, the address, three steps.
export default async function InstallCardPage() {
  const installUrl = `${siteOrigin()}/install`;
  const qr = await qrDataUri(installUrl, 320);
  const pretty = installUrl.replace(/^https?:\/\//, "");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-10 print:min-h-0 print:max-w-none print:py-0">
      <div className="bg-card flex w-full flex-col items-center gap-5 rounded-2xl p-8 text-center shadow-[inset_0_0_0_1px_var(--hairline-row)] print:rounded-none print:shadow-none">
        <BrandLogo className="h-auto w-44" />
        <h1 className="text-2xl font-extrabold leading-tight">
          Track your matches.
          <br />
          Climb the ladder.
        </h1>
        <img src={qr} alt={`QR code for ${installUrl}`} width={260} height={260} />
        <p className="stat-number text-primary text-lg">{pretty}</p>
        <ol className="text-muted-foreground flex w-full flex-col gap-1.5 text-left text-sm">
          <li>
            <span className="text-foreground font-bold">1.</span> Scan the code with your camera.
          </li>
          <li>
            <span className="text-foreground font-bold">2.</span> Add SECBL to your home screen.
          </li>
          <li>
            <span className="text-foreground font-bold">3.</span> Sign up, pick your school, get approved.
          </li>
        </ol>
        <p className="text-muted-foreground text-xs">
          Ratings · leaderboards · live brackets · events · chat. Five schools, one league.
        </p>
      </div>
      <PrintButton />
    </main>
  );
}
