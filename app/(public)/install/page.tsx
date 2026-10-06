/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { qrDataUri, siteOrigin } from "@/lib/install";
import { InstallGuide } from "./install-guide";

export const metadata = {
  title: "Get SECBL on your phone",
  description: "Install the SEC Billiards League app from your browser in two taps.",
};

export default async function InstallPage() {
  const installUrl = `${siteOrigin()}/install`;
  const qr = await qrDataUri(installUrl);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <BrandLogo className="h-auto w-48 self-center" />
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">Get SECBL on your phone</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          No app store. Install it from your browser in two taps and it lives on your home screen
          like any other app.
        </p>
      </div>

      <InstallGuide />

      <div className="flex flex-col gap-2">
        <Button asChild size="lg" className="w-full">
          <Link href="/signup">Create an account</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/login">I already have one</Link>
        </Button>
      </div>

      <div className="rounded-xl bg-card p-5 shadow-[inset_0_0_0_1px_var(--hairline-row)]">
        <p className="text-center text-sm font-semibold">Share with your team</p>
        <p className="text-muted-foreground mt-1 text-center text-xs">
          Scan to open this page, or print a card for the table.
        </p>
        <img
          src={qr}
          alt={`QR code linking to ${installUrl}`}
          width={180}
          height={180}
          className="mx-auto mt-3"
        />
        <p className="text-muted-foreground mt-2 text-center text-xs break-all">{installUrl}</p>
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
          <Link href="/install/card">Print a table card</Link>
        </Button>
      </div>
    </main>
  );
}
