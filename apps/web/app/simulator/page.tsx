"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Keypad } from "@/components/simulator/Keypad";
import { PhoneFrame } from "@/components/simulator/PhoneFrame";
import { CallOverlay } from "@/components/simulator/CallOverlay";
import { VoicemailPanel } from "@/components/simulator/VoicemailPanel";
import { apiUrl } from "@/lib/api";
import { getSocket } from "@/lib/socket";

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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🚨</span>
          <span className="text-xl font-bold tracking-tight">ResQ</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-300">
          <Link href="/dashboard" className="hover:text-white">
            Dashboard ↗
          </Link>
        </nav>
      </header>

      <section className="mt-8 grid gap-10 md:grid-cols-[auto_1fr] md:items-start">
        <div className="space-y-3">
          {/* Mode tabs sit above the phone — USSD vs Call ResQ */}
          <div className="mx-auto flex w-[320px] divide-x-2 divide-neutral-900 border-2 border-neutral-900 bg-neutral-950 text-xs uppercase tracking-widest">
            <ModeTab
              active={mode === "ussd"}
              onClick={() => {
                setMode("ussd");
                onHangup();
              }}
              label="USSD"
            />
            <ModeTab
              active={mode === "call"}
              onClick={() => {
                setMode("call");
                onHangup();
              }}
              label="Call ResQ"
            />
          </div>

          <PhoneFrame carrier={NETWORK_CODE} status={phoneStatus}>
            {/* When a voicemail or incoming-call overlay is showing, the
                phone screen takes over the full frame so the keypad / call
                button below it does not bleed through. */}
            <div
              className={`my-3 rounded-sm border-2 border-neutral-900 bg-black/70 font-mono text-sm text-emerald-300 ${
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
            <h1 className="text-2xl font-semibold text-white">Phone simulator</h1>
            <p className="mt-1 text-neutral-400">
              Stand-in for any phone on the ResQ network. Use{" "}
              <span className="text-white">USSD</span> for a quick alert (we&apos;ll
              call you back), or <span className="text-white">Call ResQ</span> to
              leave a voicemail straight away.
            </p>
          </div>

          <div className="border-l-2 border-l-resq-red border-2 border-neutral-900 bg-neutral-950 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Caller identity
              </span>
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="btn-press text-xs text-neutral-400 hover:text-white"
              >
                {showSettings ? "Hide" : "Edit"}
              </button>
            </div>
            <div className="mt-1 font-mono text-base text-white">{phoneNumber}</div>
            {showSettings ? (
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="mt-3 w-full rounded-none border-2 border-neutral-800 bg-black px-2 py-1 font-mono text-sm text-white focus:border-resq-red focus:outline-none"
                placeholder="+234..."
              />
            ) : null}
          </div>

          {mode === "ussd" ? (
            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-neutral-500">
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
                    className="btn-press flex items-center justify-between rounded-none border-2 border-neutral-900 bg-neutral-950 px-3 py-2 text-left transition hover:border-resq-red disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="font-mono text-resq-red">{q.code}</span>
                    <span className="text-xs text-neutral-400">{q.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <ol className="space-y-1 border-l-2 border-l-neutral-800 pl-4 text-xs text-neutral-400">
            {mode === "ussd" ? (
              <>
                <li>1. Tap a quick-dial above or punch the code on the keypad.</li>
                <li>2. Press the green call button.</li>
                <li>3. We&apos;ll ring you back within ~3 s — pick up.</li>
                <li>4. Describe the emergency; AI extracts location automatically.</li>
              </>
            ) : (
              <>
                <li>1. Press the big red call button.</li>
                <li>2. The line opens silently — start talking.</li>
                <li>3. Hang up when done. AI extracts location automatically.</li>
              </>
            )}
          </ol>
        </div>
      </section>
    </main>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-press flex-1 px-3 py-2 transition ${
        active
          ? "bg-resq-red text-white"
          : "bg-neutral-950 text-neutral-400 hover:text-white"
      }`}
    >
      {label}
    </button>
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
        className="btn-press flex h-20 w-20 items-center justify-center rounded-full border-2 border-red-500/50 bg-red-600 text-white shadow-lg shadow-red-900/40 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:opacity-50"
        aria-label="Call ResQ"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.5 11.5 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A18 18 0 0 1 2 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.5 11.5 0 0 0 .57 3.6 1 1 0 0 1-.24 1l-2.23 2.2Z" />
        </svg>
      </button>
      <p className="text-[10px] uppercase tracking-widest text-neutral-500">Tap to call ResQ</p>
    </div>
  );
}

function ScreenDial({ buffer }: { buffer: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="text-[10px] uppercase tracking-widest text-emerald-700">Dial</div>
      <div className="mt-2 break-all text-xl">
        {buffer || <span className="text-emerald-800">—</span>}
      </div>
    </div>
  );
}

function ScreenCallReady() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-[10px] uppercase tracking-widest text-emerald-700">Voice line</div>
      <p className="mt-3 text-sm text-emerald-300/80">
        Press the red button to call ResQ.<br />The line opens silently —<br />you talk first.
      </p>
    </div>
  );
}

function ScreenConnecting() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="text-emerald-400">Dialling…</span>
    </div>
  );
}

function ScreenUssd({ text, ended }: { text: string; ended: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="text-[10px] uppercase tracking-widest text-emerald-700">
        {ended ? "Session ended" : "USSD"}
      </div>
      <pre className="mt-1 flex-1 whitespace-pre-wrap text-[13px] leading-snug">{text}</pre>
    </div>
  );
}

function ScreenError({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="text-[10px] uppercase tracking-widest text-red-500">Error</div>
      <pre className="mt-1 flex-1 whitespace-pre-wrap text-[12px] leading-snug text-red-300">
        {message}
      </pre>
    </div>
  );
}
