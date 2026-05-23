"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface IncidentRow {
  id: string;
  type: string;
  status: string;
  callerPhone: string | null;
  locationText: string | null;
  locationLat: number | null;
  locationLng: number | null;
  createdAt: string;
  aiSeverity: string | null;
}

interface ResponderRow {
  id: string;
  skills: string[];
  status: string;
  currentLat: number | null;
  currentLng: number | null;
  user: { name: string | null; phone: string };
}

interface UserRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: string;
}

interface Inventory {
  incidents: IncidentRow[];
  responders: ResponderRow[];
  users: UserRow[];
}

type Flash = { kind: "ok" | "err"; text: string } | null;

export default function AdminPage() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Inventory>("/admin/inventory");
      setInv(data);
    } catch (e) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : "load failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Auto-clear flash after a few seconds.
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

  async function runAction(
    label: string,
    op: () => Promise<unknown>,
    confirmText?: string,
  ) {
    if (confirmText) {
      const got = window.prompt(
        `Type "${confirmText}" to confirm. This cannot be undone.`,
      );
      if (got !== confirmText) {
        setFlash({ kind: "err", text: "Confirmation didn't match — aborted." });
        return;
      }
    }
    setBusy(label);
    try {
      await op();
      setFlash({ kind: "ok", text: `${label} ✓` });
      await reload();
    } catch (e) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : `${label} failed` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-resq-dark text-neutral-200">
      <header className="border-b-2 border-neutral-900 bg-black/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="btn-press text-neutral-400 hover:text-white">
              ← Dashboard
            </Link>
            <span className="text-xl">🛠️</span>
            <h1 className="text-lg font-semibold text-white">Admin</h1>
          </div>
          <span className="border-2 border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-rose-300">
            Unauthenticated · destructive
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {flash ? (
          <div
            className={`border-2 px-4 py-2 text-sm ${
              flash.kind === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200"
            }`}
          >
            {flash.text}
          </div>
        ) : null}

        {/* Top-level destructive actions */}
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-neutral-500">
            Bulk actions
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <ActionCard
              label="Run full seed"
              description="Upserts the coordinator + 16 responders across PH/Nsukka/Enugu/Lagos, and recreates the 12 demo incidents. Existing demo incidents are wiped first."
              busy={busy === "Seed"}
              onClick={() =>
                runAction("Seed", () => api("/admin/seed", { method: "POST" }))
              }
              tone="primary"
            />
            <ActionCard
              label="Wipe incidents only"
              description="Deletes all incidents, calls, USSD sessions, and responder linkages. Users and responder profiles stay."
              busy={busy === "Wipe incidents"}
              onClick={() =>
                runAction(
                  "Wipe incidents",
                  () => api("/admin/wipe-incidents", { method: "POST" }),
                  "wipe incidents",
                )
              }
              tone="warn"
            />
            <ActionCard
              label="Wipe everything"
              description="Truncates ALL tables — users, responders, incidents, calls, sessions. You'll need to reseed before the app works again."
              busy={busy === "Wipe all"}
              onClick={() =>
                runAction(
                  "Wipe all",
                  () => api("/admin/wipe-all", { method: "POST" }),
                  "wipe everything",
                )
              }
              tone="danger"
            />
          </div>
        </section>

        {/* Per-row tables */}
        {loading && !inv ? (
          <p className="text-sm text-neutral-500">Loading inventory…</p>
        ) : inv ? (
          <>
            <RowTable<IncidentRow>
              title={`Incidents (${inv.incidents.length})`}
              rows={inv.incidents}
              empty="No incidents."
              busyId={busy?.startsWith("incident:") ? busy.slice(9) : null}
              onDelete={(row) =>
                runAction(
                  `incident:${row.id}`,
                  () => api(`/admin/incidents/${row.id}`, { method: "DELETE" }),
                )
              }
              columns={[
                { header: "Type", get: (r) => r.type },
                { header: "Status", get: (r) => r.status },
                { header: "Caller", get: (r) => r.callerPhone ?? "—" },
                {
                  header: "Location",
                  get: (r) =>
                    r.locationText ??
                    (r.locationLat != null && r.locationLng != null
                      ? `${r.locationLat.toFixed(3)}, ${r.locationLng.toFixed(3)}`
                      : "—"),
                },
                { header: "Severity", get: (r) => r.aiSeverity ?? "—" },
                {
                  header: "Created",
                  get: (r) => new Date(r.createdAt).toLocaleString(),
                },
              ]}
              getId={(r) => r.id}
            />

            <RowTable<ResponderRow>
              title={`Responders (${inv.responders.length})`}
              rows={inv.responders}
              empty="No responders."
              busyId={busy?.startsWith("responder:") ? busy.slice(10) : null}
              onDelete={(row) =>
                runAction(
                  `responder:${row.id}`,
                  () => api(`/admin/responders/${row.id}`, { method: "DELETE" }),
                )
              }
              columns={[
                { header: "Name", get: (r) => r.user.name ?? "—" },
                { header: "Phone", get: (r) => r.user.phone },
                { header: "Skills", get: (r) => r.skills.join(", ") },
                { header: "Status", get: (r) => r.status },
                {
                  header: "Location",
                  get: (r) =>
                    r.currentLat != null && r.currentLng != null
                      ? `${r.currentLat.toFixed(3)}, ${r.currentLng.toFixed(3)}`
                      : "—",
                },
              ]}
              getId={(r) => r.id}
            />

            <RowTable<UserRow>
              title={`Users (${inv.users.length})`}
              rows={inv.users}
              empty="No users."
              busyId={busy?.startsWith("user:") ? busy.slice(5) : null}
              onDelete={(row) =>
                runAction(
                  `user:${row.id}`,
                  () => api(`/admin/users/${row.id}`, { method: "DELETE" }),
                )
              }
              columns={[
                { header: "Phone", get: (r) => r.phone },
                { header: "Name", get: (r) => r.name ?? "—" },
                { header: "Email", get: (r) => r.email ?? "—" },
                { header: "Role", get: (r) => r.role },
                {
                  header: "Created",
                  get: (r) => new Date(r.createdAt).toLocaleString(),
                },
              ]}
              getId={(r) => r.id}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}

function ActionCard({
  label,
  description,
  onClick,
  busy,
  tone,
}: {
  label: string;
  description: string;
  onClick: () => void;
  busy: boolean;
  tone: "primary" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-500/60 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
      : tone === "warn"
        ? "border-amber-500/60 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
        : "border-emerald-500/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20";
  return (
    <div className="flex flex-col border-2 border-neutral-900 bg-neutral-950 p-4">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`btn-press border-2 px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${toneClass}`}
      >
        {busy ? "Working…" : label}
      </button>
      <p className="mt-3 text-xs text-neutral-400">{description}</p>
    </div>
  );
}

interface Column<T> {
  header: string;
  get: (row: T) => string;
}

function RowTable<T>({
  title,
  rows,
  empty,
  columns,
  getId,
  onDelete,
  busyId,
}: {
  title: string;
  rows: T[];
  empty: string;
  columns: Column<T>[];
  getId: (row: T) => string;
  onDelete: (row: T) => void;
  busyId: string | null;
}) {
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-widest text-neutral-500">{title}</h2>
      <div className="mt-3 overflow-x-auto border-2 border-neutral-900">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-black/40 text-[10px] uppercase tracking-widest text-neutral-500">
            <tr>
              {columns.map((c) => (
                <th key={c.header} className="px-3 py-2 font-medium">
                  {c.header}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-4 text-neutral-500"
                  colSpan={columns.length + 1}
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = getId(row);
                const busy = busyId === id;
                return (
                  <tr
                    key={id}
                    className="border-t border-neutral-900 text-neutral-200 odd:bg-neutral-950/40"
                  >
                    {columns.map((c) => (
                      <td key={c.header} className="px-3 py-2 align-top">
                        {c.get(row)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        disabled={busy}
                        className="btn-press border-2 border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
                      >
                        {busy ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
