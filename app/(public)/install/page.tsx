/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PublicShell } from "@/components/public-shell";
import { qrDataUri, siteOrigin } from "@/lib/install";
import { InstallGuide } from "./install-guide";

export const metadata = {
  title: "Get SECBL on your phone",
  description: "Install the SEC Billiards League app from your browser in two taps.",
};

export default async function InstallPage() {
  const installUrl = `${siteOrigin()}/install`;
  const qr = await qrDataUri(installUrl, 180);

  return (
    <PublicShell
      compact
      eyebrow="Get the app"
      title="SECBL on your phone."
      lead="No app store. Install it from your browser in two taps and it lives on your home screen like any other app."
    >
      <InstallGuide />

      <div className="flex flex-col gap-2">
        <Button asChild size="xl" className="w-full">
          <Link href="/signup">Create an account</Link>
        </Button>
        <Button asChild size="xl" variant="outline" className="w-full">
          <Link href="/login">I already have one</Link>
        </Button>
      </div>

      <section className="bg-card flex flex-col items-center gap-3 rounded-[20px] p-6 text-center shadow-[inset_0_0_0_1px_var(--hairline-row)]">
        <span className="eyebrow">Share with your team</span>
        <p className="text-muted-foreground text-[13px]">Scan to open this page, or print the invitation for the table.</p>
        <img src={qr} alt={`QR code linking to ${installUrl}`} width={180} height={180} className="my-1" />
        <p className="text-muted-foreground stat-number text-[12px] break-all">{installUrl.replace(/^https?:\/\//, "")}</p>
        <Button asChild variant="ghost" size="sm">
          <Link href="/install/card">Open the invitation</Link>
        </Button>
      </section>
    </PublicShell>
  );
}
