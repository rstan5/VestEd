import { scoreComponentNames, type ScoreBasis } from "@/lib/board-rows";
import { Tag } from "./ui";

/** Partial status and the components a published score used. */
export function ScoreBasisNote({ basis }: { basis: ScoreBasis | null | undefined }) {
  if (!basis || basis.label === "Unavailable") return null;
  const names = scoreComponentNames(basis);
  return (
    <span className="mt-1 flex flex-wrap items-center justify-end gap-1 text-[11px] leading-4 text-quiet" data-score-label={basis.label}>
      {basis.label === "Partial" ? <Tag>Partial</Tag> : null}
      <span>Uses {names.length > 0 ? names.join(", ") : "no components"}</span>
    </span>
  );
}
