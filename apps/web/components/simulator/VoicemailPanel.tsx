"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

type Phase =
  | { kind: "init" }
  | { kind: "requesting_mic" }
  | { kind: "recording" }
  | { kind: "uploading" }
  | { kind: "ended" }
  | { kind: "error"; message: string };

interface CapturedLine {
  role: "user";
  message: string;
}

interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface VoicemailPanelProps {
  phoneNumber: string;
  incidentId?: string;
  onClose: () => void;
}

// Browser-side voicemail capture. No conversational agent. MediaRecorder
// holds the audio (currently unused server-side), the Web Speech API does
// the live transcription, and on hangup we POST the captured lines + GPS
// to /voice/transcript. Falls back gracefully on browsers without
// SpeechRecognition (Firefox, etc.) — the incident still lands with the
// caller's coordinates and a callback flag for the coordinator.
export function VoicemailPanel({ phoneNumber, incidentId, onClose }: VoicemailPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "init" });
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState<string>("");
  const [seconds, setSeconds] = useState(0);
  const [geo, setGeo] = useState<GeoFix | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "ok" | "denied" | "unavailable">("idle");
  const [sttSupported, setSttSupported] = useState<boolean>(true);

  const transcriptRef = useRef<CapturedLine[]>([]);
  const interimRef = useRef<string>("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const uploadedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // ---- Geolocation ----------------------------------------------------
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        };
        setGeo(fix);
        setGeoStatus("ok");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, []);

  // ---- Upload on hangup -----------------------------------------------
  const uploadTranscript = useCallback(async () => {
    if (uploadedRef.current) return;
    uploadedRef.current = true;

    if (interimRef.current.trim()) {
      transcriptRef.current.push({ role: "user", message: interimRef.current.trim() });
      interimRef.current = "";
    }

    const captured = transcriptRef.current;

    setPhase({ kind: "uploading" });
    try {
      const payload = captured.length > 0
        ? captured
        : [
            {
              role: "user" as const,
              message:
                "[no transcript captured. coordinator should call this number back.]",
            },
          ];
      const res = await fetch(`${apiUrl}/voice/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: `web-${Date.now()}`,
          agent_id: "web-direct",
          caller_id: phoneNumber,
          transcript: payload,
          ...(incidentId ? { incident_id: incidentId } : {}),
          ...(geo
            ? {
                location_lat: geo.lat,
                location_lng: geo.lng,
                location_accuracy: geo.accuracy,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
      }
      setPhase({ kind: "ended" });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [phoneNumber, incidentId, geo]);

  // ---- Start recording session ----------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setPhase({ kind: "requesting_mic" });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        try {
          const rec = new MediaRecorder(stream);
          recorderRef.current = rec;
          rec.start();
        } catch {
          /* non-fatal */
        }

        const SR =
          (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition })
            .SpeechRecognition ||
          (window as unknown as {
            webkitSpeechRecognition?: typeof window.SpeechRecognition;
          }).webkitSpeechRecognition;

        if (SR) {
          const recog = new SR();
          recog.continuous = true;
          recog.interimResults = true;
          recog.lang = "en-US";
          recog.onresult = (e: SpeechRecognitionEvent) => {
            let next = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const r = e.results[i];
              if (r.isFinal) {
                const text = r[0].transcript.trim();
                if (text) {
                  transcriptRef.current.push({ role: "user", message: text });
                  setLines((prev) => [...prev, text]);
                }
              } else {
                next += r[0].transcript;
              }
            }
            interimRef.current = next;
            setInterim(next);
          };
          recog.onerror = (e: SpeechRecognitionErrorEvent) => {
            if (e.error !== "no-speech" && e.error !== "aborted") {
              console.warn("[voicemail] STT:", e.error);
            }
          };
          recog.onend = () => {
            if (!uploadedRef.current && recognitionRef.current === wrapper) {
              try {
                recog.start();
              } catch {
                /* user hung up mid-restart */
              }
            }
          };
          const wrapper = {
            stop: () => recog.stop(),
            abort: () => recog.abort(),
          };
          recognitionRef.current = wrapper;
          recog.start();
        } else {
          setSttSupported(false);
        }

        setPhase({ kind: "recording" });

        const started = Date.now();
        timerRef.current = window.setInterval(() => {
          setSeconds(Math.floor((Date.now() - started) / 1000));
        }, 250);
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : "Microphone unavailable",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll transcript area to the bottom as new lines arrive.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, interim]);

  // ---- Cleanup --------------------------------------------------------
  const stopEverything = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  const handleHangup = useCallback(() => {
    stopEverything();
    void uploadTranscript();
  }, [stopEverything, uploadTranscript]);

  // ---- Labels ---------------------------------------------------------
  const isLive = phase.kind === "recording";

  const statusLabel = useMemo(() => {
    switch (phase.kind) {
      case "init":
      case "requesting_mic":
        return "CONNECTING";
      case "recording":
        return "RECORDING";
      case "uploading":
        return "SENDING";
      case "ended":
        return "SENT";
      case "error":
        return "ERROR";
    }
  }, [phase.kind]);

  const headline = useMemo(() => {
    switch (phase.kind) {
      case "init":
        return "Opening the line";
      case "requesting_mic":
        return "Mic + location";
      case "recording":
        return "We are listening";
      case "uploading":
        return "Sending transcript";
      case "ended":
        return "Help is on the way";
      case "error":
        return "Recording failed";
    }
  }, [phase.kind]);

  const subline = useMemo(() => {
    switch (phase.kind) {
      case "init":
      case "requesting_mic":
        return "Allow microphone and location.";
      case "recording":
        return sttSupported
          ? "Say what is happening. Hang up when done."
          : "Recording. Live captions not supported in this browser.";
      case "uploading":
        return "Posting to the dispatcher.";
      case "ended":
        return "The coordinator has your location and transcript.";
      case "error":
        return phase.message;
    }
  }, [phase, sttSupported]);

  const visibleLines = lines.slice(-3);

  return (
    <div className="flex h-full flex-col rounded-sm bg-gradient-to-b from-neutral-950 to-black p-3 text-emerald-100">
      {/* ---- Top status bar ---- */}
      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isLive
                ? "bg-red-500 animate-pulse"
                : phase.kind === "ended"
                  ? "bg-emerald-400"
                  : "bg-amber-400"
            }`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
            {statusLabel}
          </span>
        </div>
        <span className="font-mono text-[11px] text-emerald-200/80">{formatTime(seconds)}</span>
      </div>

      {/* ---- Mic with pulse rings ---- */}
      <div className="relative mx-auto mt-3 flex h-24 w-24 items-center justify-center">
        {isLive ? (
          <>
            <span
              className="absolute inset-0 rounded-full border border-emerald-400/60 animate-pulse-ring"
              style={{ animationDelay: "0s" }}
            />
            <span
              className="absolute inset-0 rounded-full border border-emerald-400/40 animate-pulse-ring"
              style={{ animationDelay: "0.5s" }}
            />
            <span
              className="absolute inset-0 rounded-full border border-emerald-400/25 animate-pulse-ring"
              style={{ animationDelay: "1s" }}
            />
          </>
        ) : null}
        <div
          className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors ${
            isLive
              ? "border-emerald-300/80 bg-emerald-500/15 text-emerald-200"
              : phase.kind === "ended"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : phase.kind === "error"
                  ? "border-red-500/60 bg-red-500/10 text-red-300"
                  : "border-emerald-500/30 bg-black/40 text-emerald-300/80"
          }`}
        >
          {phase.kind === "ended" ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : phase.kind === "error" ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
            </svg>
          )}
        </div>
      </div>

      {/* ---- Headline + subline ---- */}
      <div className="mt-3 text-center">
        <div className="text-sm font-semibold text-white">{headline}</div>
        <p className="mx-auto mt-1 max-w-[220px] text-[11px] leading-snug text-emerald-200/70">
          {subline}
        </p>
      </div>

      {/* ---- Transcript bubble ---- */}
      <div className="mt-3 flex-1 overflow-hidden">
        {visibleLines.length === 0 && !interim ? (
          <div className="flex h-full items-center justify-center text-center text-[10px] uppercase tracking-widest text-emerald-300/40">
            {isLive ? "Listening…" : "Awaiting line"}
          </div>
        ) : (
          <div className="flex h-full flex-col-reverse overflow-y-auto">
            <div ref={transcriptEndRef} />
            <div className="space-y-1.5 px-1 py-1">
              {visibleLines.map((line, i) => {
                const offset = visibleLines.length - 1 - i;
                const opacity = offset === 0 ? 1 : offset === 1 ? 0.6 : 0.35;
                return (
                  <div
                    key={`${i}-${line.slice(0, 8)}`}
                    className="rounded-sm border border-emerald-500/15 bg-emerald-500/5 px-2 py-1 text-[11px] leading-snug text-emerald-50"
                    style={{ opacity }}
                  >
                    {line}
                  </div>
                );
              })}
              {interim ? (
                <div className="rounded-sm border border-dashed border-emerald-500/30 px-2 py-1 text-[11px] italic leading-snug text-emerald-200/60">
                  {interim}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* ---- Footer chips ---- */}
      <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.18em]">
        <span
          className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 ${
            geoStatus === "ok"
              ? "border-emerald-500/40 text-emerald-300"
              : geoStatus === "denied"
                ? "border-red-500/40 text-red-300"
                : "border-emerald-500/20 text-emerald-300/60"
          }`}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {geoStatus === "ok"
            ? geo?.accuracy != null
              ? `GPS ±${Math.round(geo.accuracy)}m`
              : "GPS locked"
            : geoStatus === "denied"
              ? "GPS denied"
              : geoStatus === "unavailable"
                ? "GPS off"
                : "Locating"}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 ${
            sttSupported
              ? "border-emerald-500/40 text-emerald-300"
              : "border-amber-500/40 text-amber-300"
          }`}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect width="6" height="12" x="9" y="2" rx="3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          {sttSupported ? "Live captions" : "Captions off"}
        </span>
      </div>

      {/* ---- Hangup button ---- */}
      <button
        type="button"
        onClick={() => {
          if (phase.kind === "ended" || phase.kind === "error") {
            onClose();
          } else {
            handleHangup();
          }
        }}
        className={`btn-press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-sm border-2 font-semibold uppercase tracking-[0.12em] transition-colors ${
          isLive || phase.kind === "uploading" || phase.kind === "init" || phase.kind === "requesting_mic"
            ? "border-red-500/60 bg-red-600 text-white shadow-lg shadow-red-900/40 hover:bg-red-700"
            : phase.kind === "ended"
              ? "border-emerald-500/40 bg-emerald-700/80 text-white hover:bg-emerald-700"
              : "border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700"
        }`}
        aria-label={isLive ? "Hang up" : "Close"}
      >
        {isLive ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 9c-3.8 0-7.3 1.3-10.1 3.4a1 1 0 0 0-.4.8v2.6a1 1 0 0 0 1.4.9l3.6-1.7a1 1 0 0 0 .6-.9v-2c1.6-.4 3.2-.6 4.9-.6s3.3.2 4.9.6v2a1 1 0 0 0 .6.9l3.6 1.7A1 1 0 0 0 22.5 16v-2.8a1 1 0 0 0-.4-.8C19.3 10.3 15.8 9 12 9Z" />
            </svg>
            <span className="text-[13px]">Hang up</span>
          </>
        ) : phase.kind === "ended" || phase.kind === "error" ? (
          <span className="text-[13px]">Close</span>
        ) : (
          <span className="text-[13px]">Cancel</span>
        )}
      </button>
    </div>
  );
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---- Web Speech API types (minimal) ----------------------------------
declare global {
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: {
      length: number;
      [i: number]: {
        isFinal: boolean;
        [i: number]: { transcript: string };
      };
    };
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
  }
  interface Window {
    SpeechRecognition: {
      new (): {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((e: SpeechRecognitionEvent) => void) | null;
        onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };
    };
  }
}
