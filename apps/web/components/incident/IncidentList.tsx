"use client";

import type { Incident } from "@resq/shared/types";
import {
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_COLOR,
  TYPE_LABEL,
  timeAgo,
} from "@/lib/incidents";
import { Badge } from "@/components/ui/Badge";
import clsx from "clsx";

const TYPE_EMOJI: Record<Incident["type"], string> = {
  medical: "🩹",
  fire: "🔥",
  crime: "🚨",
  accident: "🚗",
};

export function IncidentList({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (incidents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-neutral-500">
        <span className="text-2xl opacity-50">📭</span>
        <p>No active incidents.</p>
        <p className="text-xs text-neutral-600">
          Dial <span className="font-mono">*384*1#</span> on a test phone to fire one.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5 p-2">
      {incidents.map((i) => {
        const isSelected = selectedId === i.id;
        const typeColor = TYPE_COLOR[i.type];
        return (
          <li
            key={i.id}
            onClick={() => onSelect(i.id)}
            className={clsx(
              "surface-hover btn-press cursor-pointer rounded-xl border px-3 py-2.5",
              isSelected
                ? "border-resq-red/50 bg-resq-red/10"
                : "border-neutral-900 bg-neutral-900/30 hover:border-neutral-800 hover:bg-neutral-900/60",
            )}
          >
            <div className="flex items-start gap-3">
              {/* Type avatar — circular, type-coloured, emoji centre. */}
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base shadow-md"
                style={{
                  background: typeColor,
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
                }}
              >
                <span style={{ filter: "saturate(1.2)" }}>{TYPE_EMOJI[i.type]}</span>
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-neutral-100">
                    {TYPE_LABEL[i.type]}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
                    {timeAgo(i.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-neutral-400">
                  {i.locationText ?? i.callerPhone ?? "Location pending"}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Badge tone={STATUS_TONE[i.status]} size="sm">
                    {STATUS_LABEL[i.status]}
                  </Badge>
                  {i.aiSeverity ? (
                    <Badge tone={SEVERITY_TONE[i.aiSeverity]} size="sm">
                      {i.aiSeverity}
                    </Badge>
                  ) : null}
                  {i.aiTriageScore != null ? (
                    <span className="text-[10px] tabular-nums text-neutral-500">
                      · {i.aiTriageScore}/10
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
