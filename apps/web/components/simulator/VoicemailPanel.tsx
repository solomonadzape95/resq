"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

type NoMicReason = "insecure_context" | "no_media_api" | "denied" | "unknown";

type Phase =
  | { kind: "init" }
  | { kind: "requesting_mic" }
  | { kind: "recording" }
  | { kind: "uploading" }
  | { kind: "ended" }
  | { kind: "error"; message: string }
  // Mic is unavailable for one of the structural reasons below — usually
  // the page is on HTTP (insecure context). The text-mode fallback button
  // offers a way to still send an incident.
  | { kind: "no_mic"; reason: NoMicReason }
  // Text-input alternative to voicemail. Reachable from `no_mic` or by
  // opt-in. Submits via the same /voice/transcript endpoint, just with no
  // audio_base64 and a single user line.
  | { kind: "text_mode" };

// Decide if this browser can actually record audio. The check has to
// happen BEFORE we call getUserMedia, because on an insecure context (any
// non-HTTPS, non-localhost origin) the browser rejects the call with a
// generic error that doesn't tell the user what to do.
function detectMicCapability(): { canRecord: boolean; reason?: NoMicReason } {
  if (typeof window === "undefined") return { canRecord: false, reason: "unknown" };
  if (!window.isSecureContext) {
    return { canRecord: false, reason: "insecure_context" };
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return { canRecord: false, reason: "no_media_api" };
  }
  return { canRecord: true };
}

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
  const [micCapability] = useState(() => detectMicCapability());
  // Backing text for the text-mode <textarea>. Lifted to component state so
  // the parent can render it conditionally without losing keystrokes.
  const [textDraft, setTextDraft] = useState("");
  // Once the user enters text mode, all subsequent phases (uploading,
  // ended, error) keep rendering the text shell so the success/error
  // message lands in context.
  const flowKindRef = useRef<"voice" | "text">("voice");

  const transcriptRef = useRef<CapturedLine[]>([]);
  const interimRef = useRef<string>("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioMimeRef = useRef<string>("audio/webm");
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const uploadedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Stop the MediaRecorder, await its final `ondataavailable` event, build
  // the blob and base64-encode it. Resolves to null if no audio was
  // captured. Also tears down the live mic stream once recording is fully
  // flushed — order matters: stop the recorder *before* the tracks so the
  // recorder doesn't emit an error and drop the trailing chunk.
  const flushAudio = useCallback(async (): Promise<{
    base64: string;
    mime: string;
  } | null> => {
    const rec = recorderRef.current;

    const releaseTracks = () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      recorderRef.current = null;
    };

    if (!rec) {
      releaseTracks();
      return null;
    }

    return new Promise((resolve) => {
      const finalise = () => {
        releaseTracks();
        const blob = new Blob(audioChunksRef.current, { type: audioMimeRef.current });
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1] ?? "";
          resolve({ base64, mime: audioMimeRef.current });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      };

      if (rec.state === "inactive") {
        finalise();
        return;
      }
      rec.onstop = finalise;
      try {
        rec.stop();
      } catch {
        finalise();
      }
    });
  }, []);

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

    // Flush MediaRecorder first so we can include the audio blob if the
    // client-side Web Speech API didn't manage to transcribe anything
    // (iOS Safari, Firefox, denied permissions, etc.).
    const audio = await flushAudio();

    // If we have neither client transcript nor recorded audio, don't post
    // a fake placeholder — surface the failure and let the user retry.
    if (captured.length === 0 && !audio) {
      uploadedRef.current = false;
      setPhase({
        kind: "error",
        message: "Couldn't capture any speech. Check the mic and try again.",
      });
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/voice/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: `web-${Date.now()}`,
          agent_id: "web-direct",
          caller_id: phoneNumber,
          transcript: captured,
          ...(audio
            ? { audio_base64: audio.base64, audio_mime: audio.mime }
            : {}),
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
        // Prefer the server's human message + reason when it gave us JSON
        // (e.g. STT not configured, recording was silent, etc.) — they're
        // much more actionable than a raw status code.
        const bodyText = await res.text();
        let friendly = `API ${res.status}: ${bodyText.slice(0, 200)}`;
        try {
          const parsed = JSON.parse(bodyText) as {
            message?: string;
            reason?: string;
          };
          if (parsed.message) {
            friendly = parsed.reason
              ? `${parsed.message} (${parsed.reason})`
              : parsed.message;
          }
        } catch {
          /* not JSON — keep the raw fallback */
        }
        // Allow another hangup-and-retry without forcing a panel reset.
        uploadedRef.current = false;
        throw new Error(friendly);
      }
      setPhase({ kind: "ended" });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [phoneNumber, incidentId, geo, flushAudio]);

  // ---- Start recording session ----------------------------------------
  useEffect(() => {
    let cancelled = false;

    // Hard-block before we ever touch getUserMedia. On HTTP origins the
    // call would throw a generic SecurityError; we'd rather surface a
    // specific reason and an alternative path (text mode).
    if (!micCapability.canRecord) {
      setPhase({ kind: "no_mic", reason: micCapability.reason ?? "unknown" });
      return;
    }

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
          // Pick whatever mime the browser actually negotiated (Chrome
          // typically returns audio/webm;codecs=opus, Safari audio/mp4).
          // We forward this to the server so Scribe gets the right ext.
          if (rec.mimeType) audioMimeRef.current = rec.mimeType;
          audioChunksRef.current = [];
          rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };
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
        // The browser sometimes throws even after `isSecureContext` is
        // true (e.g. the user denied permission, or another tab is using
        // the mic). Treat denials as `no_mic` so the text-mode CTA still
        // appears; other errors stay as the generic error phase.
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setPhase({ kind: "no_mic", reason: "denied" });
        } else {
          setPhase({
            kind: "error",
            message: err instanceof Error ? err.message : "Microphone unavailable",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [micCapability]);

  // Auto-scroll transcript area to the bottom as new lines arrive.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, interim]);

  // ---- Cleanup --------------------------------------------------------
  // stopEverything only kills the recognition+timer. The MediaRecorder and
  // mic tracks are torn down by flushAudio so the upload gets the final
  // data chunk before the stream is released.
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
  }, []);

  // Unmount-time hard cleanup: if the user closed the panel before hanging
  // up, kill the recorder + tracks so the mic indicator goes away.
  useEffect(
    () => () => {
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
    },
    [],
  );

  const handleHangup = useCallback(() => {
    stopEverything();
    void uploadTranscript();
  }, [stopEverything, uploadTranscript]);

  // Text-mode submit. Same /voice/transcript endpoint; we just stuff the
  // typed message into transcriptRef so uploadTranscript can carry it
  // through the existing flow (which also handles the empty-audio path).
  const handleTextSubmit = useCallback(() => {
    const text = textDraft.trim();
    if (!text) return;
    transcriptRef.current = [{ role: "user", message: text }];
    uploadedRef.current = false;
    void uploadTranscript();
  }, [textDraft, uploadTranscript]);

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
      case "no_mic":
        return "NO MIC";
      case "text_mode":
        return "TEXT MODE";
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
      case "no_mic":
        return "Mic unavailable";
      case "text_mode":
        return "Type your emergency";
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
      case "no_mic":
        return NO_MIC_EXPLANATION[phase.reason];
      case "text_mode":
        return "Press send when you're done. AI extracts the location and severity.";
    }
  }, [phase, sttSupported]);

  const visibleLines = lines.slice(-3);

  // Early returns for the two non-voice flows. They render a different
  // shell so we don't fake a mic icon + transcript bubble when neither
  // applies.
  if (phase.kind === "no_mic") {
    return (
      <NoMicShell
        reason={phase.reason}
        headline={headline}
        subline={subline}
        statusLabel={statusLabel}
        onSwitchToText={() => {
          flowKindRef.current = "text";
          setPhase({ kind: "text_mode" });
        }}
        onClose={onClose}
      />
    );
  }

  if (flowKindRef.current === "text") {
    return (
      <TextModeShell
        phase={phase}
        headline={headline}
        subline={subline}
        statusLabel={statusLabel}
        textDraft={textDraft}
        setTextDraft={setTextDraft}
        onSubmit={handleTextSubmit}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-gradient-to-b from-neutral-950 to-black p-3.5 text-emerald-100">
      {/* ---- Top status bar ---- */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
        <Badge
          size="sm"
          tone={
            isLive
              ? "red"
              : phase.kind === "ended"
                ? "emerald"
                : phase.kind === "error"
                  ? "red"
                  : "amber"
          }
          dot
          className={isLive ? "[&_span:first-child]:animate-pulse" : ""}
        >
          {statusLabel}
        </Badge>
        <span className="font-mono text-[11px] tabular-nums text-emerald-200/80">
          {formatTime(seconds)}
        </span>
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
          <div className="flex h-full items-center justify-center text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/40">
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
                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] leading-snug text-emerald-50"
                    style={{ opacity }}
                  >
                    {line}
                  </div>
                );
              })}
              {interim ? (
                <div className="rounded-xl border border-dashed border-emerald-500/30 px-2.5 py-1.5 text-[11px] italic leading-snug text-emerald-200/60">
                  {interim}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* ---- Footer chips ---- */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <Badge
          size="sm"
          tone={
            geoStatus === "ok"
              ? "emerald"
              : geoStatus === "denied"
                ? "red"
                : "neutral"
          }
        >
          {geoStatus === "ok"
            ? geo?.accuracy != null
              ? `GPS ±${Math.round(geo.accuracy)}m`
              : "GPS locked"
            : geoStatus === "denied"
              ? "GPS denied"
              : geoStatus === "unavailable"
                ? "GPS off"
                : "Locating"}
        </Badge>
        <Badge size="sm" tone={sttSupported ? "emerald" : "amber"}>
          {sttSupported ? "Live captions" : "Captions off"}
        </Badge>
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
        className={`btn-press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold uppercase tracking-wider transition-colors ${
          isLive || phase.kind === "uploading" || phase.kind === "init" || phase.kind === "requesting_mic"
            ? "bg-red-600 text-white shadow-lg shadow-red-900/50 hover:bg-red-500"
            : phase.kind === "ended"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500"
              : "bg-neutral-800 text-white hover:bg-neutral-700"
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

// Mic-unavailable copy keyed by reason. Each ends with the action the user
// can take, written for a non-technical reader.
const NO_MIC_EXPLANATION: Record<NoMicReason, string> = {
  insecure_context:
    "This page is on HTTP. Phones block the mic until the connection is HTTPS. Open https://resq-web.onrender.com/simulator on your phone, or set up an HTTPS tunnel with `ngrok http 3000`.",
  no_media_api:
    "This browser doesn't support voice capture. Try Chrome or Safari, or use text mode below.",
  denied:
    "Microphone permission was denied. Allow mic access in your browser settings and reload — or use text mode below.",
  unknown: "We couldn't access the mic on this device. Use text mode below.",
};

function NoMicShell({
  reason,
  headline,
  subline,
  statusLabel,
  onSwitchToText,
  onClose,
}: {
  reason: NoMicReason;
  headline: string;
  subline: string;
  statusLabel: string;
  onSwitchToText: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-gradient-to-b from-neutral-950 to-black p-3.5 text-neutral-100">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
        <Badge tone="amber" size="sm" dot>
          {statusLabel}
        </Badge>
        <button
          type="button"
          onClick={onClose}
          className="btn-press text-[11px] uppercase tracking-wider text-neutral-500 hover:text-white"
        >
          Close
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-400/40">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-200"
            aria-hidden
          >
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-white">{headline}</div>
        <p className="max-w-[260px] text-[11px] leading-relaxed text-neutral-400">
          {NO_MIC_EXPLANATION[reason] ?? subline}
        </p>
      </div>
      <button
        type="button"
        onClick={onSwitchToText}
        className="btn-press mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-resq-red text-[12px] font-semibold uppercase tracking-wider text-white shadow-lg shadow-resq-red/25 hover:bg-red-700"
      >
        Use text mode instead →
      </button>
    </div>
  );
}

function TextModeShell({
  phase,
  headline,
  subline,
  statusLabel,
  textDraft,
  setTextDraft,
  onSubmit,
  onClose,
}: {
  phase: Phase;
  headline: string;
  subline: string;
  statusLabel: string;
  textDraft: string;
  setTextDraft: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const isSending = phase.kind === "uploading";
  const isDone = phase.kind === "ended";
  const isError = phase.kind === "error";
  const canSubmit =
    textDraft.trim().length > 0 && !isSending && !isDone;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-gradient-to-b from-neutral-950 to-black p-3.5 text-neutral-100">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
        <Badge
          tone={
            isError ? "red" : isDone ? "emerald" : isSending ? "amber" : "rose"
          }
          size="sm"
          dot
        >
          {statusLabel}
        </Badge>
        <button
          type="button"
          onClick={onClose}
          className="btn-press text-[11px] uppercase tracking-wider text-neutral-500 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="mt-3 space-y-1 text-center">
        <div className="text-sm font-semibold text-white">{headline}</div>
        <p className="mx-auto max-w-[260px] text-[11px] leading-snug text-neutral-400">
          {subline}
        </p>
      </div>

      <textarea
        value={textDraft}
        onChange={(e) => setTextDraft(e.target.value)}
        disabled={isSending || isDone}
        placeholder="e.g. Fire at the back of the petrol station on Aba Road, near Slaughter junction. Two people need help."
        rows={5}
        className="mt-3 w-full flex-1 rounded-2xl border border-neutral-800 bg-black/40 px-3 py-2.5 text-sm leading-relaxed text-neutral-100 placeholder:text-neutral-600 outline-none transition focus:border-resq-red/50 disabled:opacity-60"
      />

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className={`btn-press mt-3 flex h-12 w-full items-center justify-center rounded-2xl text-[12px] font-semibold uppercase tracking-wider transition ${
          isDone
            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40"
            : isError
              ? "bg-red-600 text-white shadow-lg shadow-red-900/40 hover:bg-red-500"
              : "bg-resq-red text-white shadow-lg shadow-resq-red/25 hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none"
        }`}
      >
        {isSending
          ? "Sending…"
          : isDone
            ? "Sent ✓"
            : isError
              ? "Retry"
              : "Send to dispatcher"}
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
