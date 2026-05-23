"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Keypad } from "@/components/simulator/Keypad";
import { PhoneFrame } from "@/components/simulator/PhoneFrame";
import { CallOverlay } from "@/components/simulator/CallOverlay";
import { VoicemailPanel } from "@/components/simulator/VoicemailPanel";
import {
  apiUrl,
  getApiBaseOverride,
  setApiBaseOverride,
} from "@/lib/api";
import { useApiStatus } from "@/lib/useApiStatus";
import { getSocket } from "@/lib/socket";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";

type Mode = "ussd" | "call";
type Status = "idle" | "connecting" | "session" | "ended" | "error";

const SERVICE_CODE = "*384#";
const NETWORK_CODE = "MTN";

interface UssdState {
  sessionId: string;
  text: string;
  screen: string;
}

interface IncomingCall {
  incidentId: string;
  type: "medical" | "fire" | "crime" | "accident";
  callerName: string;
}

function newSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `sim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseDial(buffer: string): { ok: true; firstChoice: string | null } | { ok: false } {
  if (buffer === SERVICE_CODE) return { ok: true, firstChoice: null };
  const match = /^\*384\*(\d+)#$/.exec(buffer);
  if (match) return { ok: true, firstChoice: match[1] };
  return { ok: false };
}

export default function SimulatorPage() {
  return (
    <Suspense fallback={null}>
      <SimulatorInner />
    </Suspense>
  );
}

function SimulatorInner() {
  const params = useSearchParams();
  const initialDial = params.get("dial") ?? "";
  const initialMode: Mode = params.get("mode") === "call" ? "call" : "ussd";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [phoneNumber, setPhoneNumber] = useState("+2348000099999");
  const [dialBuffer, setDialBuffer] = useState(initialDial);
  const [status, setStatus] = useState<Status>("idle");
  const [session, setSession] = useState<UssdState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const apiStatus = useApiStatus();

  // Inbound call from the system. When set, CallOverlay shows on top.
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  // Once answered (or directly placed by the user), this drives the
  // voicemail UI inside the phone screen.
  const [voicemail, setVoicemail] = useState<{ incidentId?: string } | null>(null);

  useEffect(() => {
    if (initialDial) setDialBuffer(initialDial);
  }, [initialDial]);

  // Subscribe to this phone's room. The USSD route (and the dashboard
  // "Ring caller" button) emit call:incoming into this room.
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    sock.emit("join:phone", phoneNumber);
    const handler = (payload: IncomingCall) => {
      // Only ring if we're not already on a call. Avoid double-pop.
      if (voicemail || incoming) return;
      setIncoming(payload);
    };
    sock.on("call:incoming", handler);
    return () => {
      sock.off("call:incoming", handler);
    };
  }, [phoneNumber, voicemail, incoming]);

  const callActive = status === "session" || status === "connecting";
  const callEnabled = dialBuffer.length > 0 && status !== "session" && status !== "connecting";

  const sendUssd = useCallback(
    async (sessionId: string, text: string) => {
      setStatus("connecting");
      setError(null);
      try {
        const res = await fetch(`${apiUrl}/ussd`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            serviceCode: SERVICE_CODE,
            phoneNumber,
            networkCode: NETWORK_CODE,
            text,
          }),
        });
        const body = await res.text();
        if (!res.ok) {
          setStatus("error");
          setError(`API ${res.status}: ${body.slice(0, 200)}`);
          return;
        }
        const screen = body.replace(/^(CON|END)\s*/, "");
        setSession({ sessionId, text, screen });
        if (body.startsWith("END")) {
          setStatus("ended");
        } else {
          setStatus("session");
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [phoneNumber],
  );

  const onKey = useCallback(
    (digit: string) => {
      if (status === "session") {
        const nextText = session ? (session.text ? `${session.text}*${digit}` : digit) : digit;
        void sendUssd(session?.sessionId ?? newSessionId(), nextText);
      } else {
        setDialBuffer((b) => b + digit);
      }
    },
    [status, session, sendUssd],
  );

  const onCall = useCallback(() => {
    if (mode === "call") {
      // Outbound voicemail: skip the dialer, go straight to recording.
      setVoicemail({});
      return;
    }
    const parsed = parseDial(dialBuffer);
    if (!parsed.ok) {
      setStatus("error");
      setError("Dial a code like *384*1# or *384#");
      return;
    }
    const sessionId = newSessionId();
    const initialText = parsed.firstChoice ?? "";
    void sendUssd(sessionId, initialText);
  }, [mode, dialBuffer, sendUssd]);

  const onHangup = useCallback(() => {
    setDialBuffer("");
    setSession(null);
    setStatus("idle");
    setError(null);
  }, []);

  const screenContent = useMemo(() => {
    if (voicemail) {
      return (
        <VoicemailPanel
          phoneNumber={phoneNumber}
          incidentId={voicemail.incidentId}
          onClose={() => setVoicemail(null)}
        />
      );
    }
    if (incoming) {
      return (
        <CallOverlay
          callerName={incoming.callerName}
          type={incoming.type}
          onAnswer={() => {
            setVoicemail({ incidentId: incoming.incidentId });
            setIncoming(null);
          }}
          onDecline={() => setIncoming(null)}
        />
      );
    }
    if (status === "error" && error) return <ScreenError message={error} />;
    if ((status === "session" || status === "ended") && session) {
      return <ScreenUssd text={session.screen} ended={status === "ended"} />;
    }
    if (status === "connecting") return <ScreenConnecting />;
    if (mode === "call") return <ScreenCallReady />;
    return <ScreenDial buffer={dialBuffer} />;
  }, [voicemail, incoming, status, error, session, mode, dialBuffer, phoneNumber]);

  const phoneStatus: "idle" | "connecting" | "session" | "ended" | "error" = voicemail
    ? "session"
    : incoming
      ? "connecting"
      : status;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="btn-press flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-resq-red text-base shadow-md shadow-resq-red/30">
            🚨
          </span>
          <span className="text-lg font-bold tracking-tight">ResQ</span>
        </Link>
        <nav className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowApiSettings((s) => !s)}
            className={`btn-press flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition ${
              apiStatus && !apiStatus.ok
                ? "border-amber-500/50 bg-amber-500/10 text-amber-200 hover:border-amber-400/60"
                : "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700 hover:text-white"
            }`}
            title="API base URL"
            aria-expanded={showApiSettings}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                !apiStatus
                  ? "bg-neutral-500"
                  : apiStatus.ok
                    ? "bg-emerald-400"
                    : "bg-amber-400 animate-pulse"
              }`}
            />
            API
          </button>
          <Link
            href="/dashboard"
            className="btn-press rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            Dashboard ↗
          </Link>
        </nav>
      </header>

      {apiStatus && !apiStatus.ok ? (
        <ApiBanner
          url={apiStatus.url}
          error={apiStatus.error}
          status={apiStatus.status}
          onConfigure={() => setShowApiSettings(true)}
        />
      ) : null}

      {showApiSettings ? (
        <ApiSettingsPopover
          currentUrl={apiUrl}
          onClose={() => setShowApiSettings(false)}
        />
      ) : null}

      <section className="mt-10 grid gap-12 md:grid-cols-[auto_1fr] md:items-start">
        <div className="space-y-4">
          {/* Mode tabs — proper segmented control above the phone. */}
          <div className="flex justify-center">
            <Tabs
              ariaLabel="Simulator mode"
              value={mode}
              size="md"
              onChange={(v) => {
                setMode(v);
                onHangup();
              }}
              items={[
                { value: "ussd", label: "USSD" },
                { value: "call", label: "Call ResQ" },
              ]}
            />
          </div>

          <PhoneFrame carrier={NETWORK_CODE} status={phoneStatus}>
            {/* When a voicemail or incoming-call overlay is showing, the
                phone screen takes over the full frame so the keypad / call
                button below it does not bleed through. */}
            <div
              className={`my-3 overflow-hidden rounded-2xl border border-white/5 bg-black/70 font-mono text-sm text-emerald-300 ${
                voicemail || incoming ? "h-96" : "h-52"
              }`}
            >
              <div className="h-full p-3">{screenContent}</div>
            </div>
            {!voicemail && !incoming ? (
              mode === "ussd" ? (
                <Keypad
                  onKey={onKey}
                  onCall={onCall}
                  onHangup={onHangup}
                  callEnabled={callEnabled}
                  callActive={callActive}
                />
              ) : (
                <CallModeControls onPlace={onCall} disabled={false} />
              )
            ) : null}
          </PhoneFrame>
        </div>

        <div className="space-y-6 text-sm text-neutral-300">
          <div>
            <Badge tone="red" size="sm">
              Phone simulator
            </Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
              Place a real call to ResQ.
            </h1>
            <p className="mt-2 max-w-md text-neutral-400">
              Stand-in for any phone on the ResQ network. Use{" "}
              <span className="text-white">USSD</span> for a quick alert (we&apos;ll
              call you back), or <span className="text-white">Call ResQ</span> to
              leave a voicemail straight away.
            </p>
          </div>

          <div className="surface-hover rounded-2xl border border-neutral-900 bg-neutral-900/40 p-4 hover:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Caller identity
              </span>
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="btn-press rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 hover:border-neutral-700 hover:text-white"
              >
                {showSettings ? "Hide" : "Edit"}
              </button>
            </div>
            <div className="mt-2 font-mono text-base tabular-nums text-white">
              {phoneNumber}
            </div>
            {showSettings ? (
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm text-white outline-none transition focus:border-resq-red/50"
                placeholder="+234..."
              />
            ) : null}
          </div>

          {mode === "ussd" ? (
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Quick dial
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  { code: "*384*1#", label: "Medical" },
                  { code: "*384*2#", label: "Fire" },
                  { code: "*384*3#", label: "Crime" },
                  { code: "*384*4#", label: "Accident" },
                ].map((q) => (
                  <button
                    key={q.code}
                    type="button"
                    disabled={callActive || Boolean(voicemail)}
                    onClick={() => {
                      onHangup();
                      setDialBuffer(q.code);
                    }}
                    className="btn-press surface-hover flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-900/40 px-3 py-2.5 text-left hover:border-resq-red/40 hover:bg-neutral-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="font-mono text-resq-red">{q.code}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      {q.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <ol className="space-y-2 text-xs text-neutral-400">
            {(mode === "ussd"
              ? [
                  "Tap a quick-dial above or punch the code on the keypad.",
                  "Press the green call button.",
                  "We'll ring you back within ~3 s — pick up.",
                  "Describe the emergency; AI extracts location automatically.",
                ]
              : [
                  "Press the big red call button.",
                  "The line opens silently — start talking.",
                  "Hang up when done. AI extracts location automatically.",
                ]
            ).map((line, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[9px] font-bold tabular-nums text-neutral-300">
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}

// Renders when the /healthz probe fails. Names the URL the app is trying
// to reach so the user knows whether to change NEXT_PUBLIC_API_URL, open
// a firewall, or paste an override.
function ApiBanner({
  url,
  error,
  status,
  onConfigure,
}: {
  url: string;
  error?: string;
  status?: number;
  onConfigure: () => void;
}) {
  return (
    <div className="animate-fade-up mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12px] leading-relaxed text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            API unreachable
          </div>
          <p className="mt-1">
            We can&apos;t reach <span className="font-mono">{url}/healthz</span>
            {status ? ` (HTTP ${status})` : error ? ` — ${error}` : ""}. On a
            phone over LAN you usually need an HTTPS tunnel (e.g.{" "}
            <span className="font-mono">ngrok http 3000</span>) and to allow
            port 4000 through the laptop firewall, or paste a different base
            URL below.
          </p>
        </div>
        <button
          type="button"
          onClick={onConfigure}
          className="btn-press shrink-0 rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-100 hover:bg-amber-500/30"
        >
          Configure
        </button>
      </div>
    </div>
  );
}

function ApiSettingsPopover({
  currentUrl,
  onClose,
}: {
  currentUrl: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string>(() => getApiBaseOverride() ?? "");
  const trimmed = draft.trim();
  const looksValid = !trimmed || /^https?:\/\/.+/.test(trimmed);

  function save() {
    if (!looksValid) return;
    setApiBaseOverride(trimmed.length > 0 ? trimmed : null);
    // Force a reload so the cached apiUrl + socket connection pick up the
    // new base URL.
    if (typeof window !== "undefined") window.location.reload();
  }

  function clear() {
    setApiBaseOverride(null);
    if (typeof window !== "undefined") window.location.reload();
  }

  return (
    <div className="animate-card-pop mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/95 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          API base URL
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-press text-[11px] uppercase tracking-wider text-neutral-500 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
        Override what this page calls. Useful for testing prod from a dev
        load, or for pointing the phone at an ngrok tunnel. Resolved URL:{" "}
        <span className="font-mono text-neutral-200">{currentUrl}</span>
      </p>
      <input
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="https://resq-api.onrender.com"
        className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 font-mono text-sm text-neutral-100 outline-none transition focus:border-resq-red/50"
      />
      {!looksValid ? (
        <p className="mt-1 text-[11px] text-amber-300">Must start with http:// or https://</p>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={clear}
          className="btn-press rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 hover:border-neutral-700 hover:text-white"
        >
          Clear override
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!looksValid}
          className="btn-press rounded-full bg-resq-red px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md shadow-resq-red/25 hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none"
        >
          Save &amp; reload
        </button>
      </div>
    </div>
  );
}

function CallModeControls({
  onPlace,
  disabled,
}: {
  onPlace: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <button
        type="button"
        onClick={onPlace}
        disabled={disabled}
        className="btn-press flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-900/50 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:opacity-50"
        aria-label="Call ResQ"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.5 11.5 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A18 18 0 0 1 2 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.5 11.5 0 0 0 .57 3.6 1 1 0 0 1-.24 1l-2.23 2.2Z" />
        </svg>
      </button>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        Tap to call ResQ
      </p>
    </div>
  );
}

function ScreenDial({ buffer }: { buffer: string }) {
  return (
    <div className="flex h-full flex-col p-2">
      <Badge tone="emerald" size="sm">
        Dial
      </Badge>
      <div className="mt-3 break-all text-2xl tabular-nums">
        {buffer || <span className="text-emerald-800">—</span>}
      </div>
    </div>
  );
}

function ScreenCallReady() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Badge tone="emerald" size="sm">
        Voice line
      </Badge>
      <p className="text-sm leading-relaxed text-emerald-300/80">
        Press the red button to call ResQ.
        <br />
        The line opens silently — you talk first.
      </p>
    </div>
  );
}

function ScreenConnecting() {
  return (
    <div className="flex h-full items-center justify-center gap-2">
      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
        Dialling…
      </span>
    </div>
  );
}

function ScreenUssd({ text, ended }: { text: string; ended: boolean }) {
  // The USSD payload comes back as plain text from the API. Split on a
  // blank line so the prompt (top) and the choice list (below) sit in
  // distinct visual blocks — feels like a real handset dialog.
  const [head, ...rest] = text.split(/\n\n+/);
  const body = rest.join("\n\n");
  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <Badge tone={ended ? "neutral" : "emerald"} size="sm" dot>
        {ended ? "Session ended" : "USSD"}
      </Badge>
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px] leading-snug text-emerald-100 whitespace-pre-wrap">
        {head}
      </div>
      {body ? (
        <pre className="flex-1 whitespace-pre-wrap rounded-xl bg-black/50 p-3 text-[12px] leading-relaxed text-emerald-200/80">
          {body}
        </pre>
      ) : null}
    </div>
  );
}

function ScreenError({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <Badge tone="red" size="sm" dot>
        Error
      </Badge>
      <pre className="flex-1 whitespace-pre-wrap rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[12px] leading-relaxed text-red-300">
        {message}
      </pre>
    </div>
  );
}
