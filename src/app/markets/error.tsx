"use client";

import Link from "next/link";
import { StatusNote } from "@/components/ui";

export default function MarketsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <StatusNote
      kind="error"
      title="Markets could not be loaded"
      body="Nothing was changed. Try again, or go back to search."
      action={
        <span className="flex flex-wrap gap-2">
          <button type="button" className="v-btn quiet small" onClick={reset}>Try again</button>
          <Link href="/markets" className="v-btn quiet small">Markets</Link>
        </span>
      }
    />
  );
}
