"use client";

import type { Incident } from "@resq/shared/types";
import { STATUS_LABEL, STATUS_VISUAL, TYPE_COLOR, TYPE_LABEL, timeAgo } from "@/lib/incidents";
import clsx from "clsx";

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
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">
        No active incidents.
        <br />
        Dial *384*1# on a test phone to fire one.
      </div>
    );
  }
  return (
    <ul>
      {incidents.map((i) => (
        <li
          key={i.id}
          onClick={() => onSelect(i.id)}
          className={clsx(
            "row-hover cursor-pointer border-b-2 border-l-4 border-neutral-900 p-4",
            selectedId === i.id
              ? "border-l-resq-red bg-neutral-900"
              : "border-l-transparent hover:border-l-neutral-700 hover:bg-neutral-900/60",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: TYPE_COLOR[i.type] }}
              />
              <span className="font-medium text-neutral-100">
                {TYPE_LABEL[i.type]}
              </span>
              {i.aiSeverity ? (
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs uppercase text-neutral-300">
                  {i.aiSeverity}
                </span>
              ) : null}
            </div>
            <span className="text-xs text-neutral-500">{timeAgo(i.createdAt)}</span>
          </div>
          <div className="mt-1 truncate text-xs text-neutral-400">
            {i.callerPhone ?? "Unknown caller"}
            {i.locationText ? ` · ${i.locationText}` : ""}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_VISUAL[i.status].badgeClass}`}
            >
              {STATUS_LABEL[i.status]}
            </span>
            {i.aiTriageScore != null ? (
              <span className="text-neutral-500">triage {i.aiTriageScore}/10</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
