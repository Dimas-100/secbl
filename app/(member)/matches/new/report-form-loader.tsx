"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ReportMatchForm as Form } from "./report-form";

// The scoreboard restores an in-progress race from localStorage, which only
// exists in the browser — so it renders client-only, with a quiet skeleton
// in the server HTML instead of a form that would flash and then change.
const ReportMatchForm = dynamic(() => import("./report-form").then((m) => m.ReportMatchForm), {
  ssr: false,
  loading: () => (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-8">
      <div className="bg-card h-12 rounded-full" />
      <div className="bg-card h-12 rounded-full" />
      <div className="bg-card h-40 rounded-[20px]" />
    </div>
  ),
});

export function ReportMatchFormLoader(props: ComponentProps<typeof Form>) {
  return <ReportMatchForm {...props} />;
}
