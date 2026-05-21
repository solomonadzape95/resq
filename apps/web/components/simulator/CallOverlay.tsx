"use client";

const TYPE_LABEL: Record<string, string> = {
  medical: "Medical emergency",
  fire: "Fire emergency",
  crime: "Crime / security",
  accident: "Road accident",
};

export interface CallOverlayProps {
  callerName: string;
  type: string;
  onAnswer: () => void;
  onDecline: () => void;
}

export function CallOverlay({ callerName, type, onAnswer, onDecline }: CallOverlayProps) {
  return (
    <div className="flex h-full flex-col items-center justify-between rounded-sm border-2 border-emerald-500/40 bg-black/95 p-4 text-center text-emerald-100">
      <div className="mt-4 flex flex-col items-center gap-3">
        <span
          aria-hidden
          className="animate-ring-shake text-4xl"
          style={{ filter: "drop-shadow(0 0 8px rgba(16,185,129,0.6))" }}
        >
          📞
        </span>
        <div className="text-[10px] uppercase tracking-widest text-emerald-300/80">
          Incoming call
        </div>
        <div className="text-base font-semibold text-white">{callerName}</div>
        <div className="text-xs text-emerald-200/80">
          {TYPE_LABEL[type] ?? "Emergency callback"}
        </div>
      </div>

      <div className="mb-2 grid w-full grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onDecline}
          className="btn-press flex h-14 items-center justify-center border-2 border-red-500/50 bg-red-600 text-white"
          aria-label="Decline"
        >
          <HangupIcon />
        </button>
        <button
          type="button"
          onClick={onAnswer}
          className="btn-press flex h-14 items-center justify-center border-2 border-emerald-400/60 bg-emerald-600 text-white"
          aria-label="Answer"
        >
          <PhoneIcon />
        </button>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.5 11.5 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A18 18 0 0 1 2 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.5 11.5 0 0 0 .57 3.6 1 1 0 0 1-.24 1l-2.23 2.2Z" />
    </svg>
  );
}

function HangupIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 9c-3.8 0-7.3 1.3-10.1 3.4a1 1 0 0 0-.4.8v2.6a1 1 0 0 0 1.4.9l3.6-1.7a1 1 0 0 0 .6-.9v-2c1.6-.4 3.2-.6 4.9-.6s3.3.2 4.9.6v2a1 1 0 0 0 .6.9l3.6 1.7A1 1 0 0 0 22.5 16v-2.8a1 1 0 0 0-.4-.8C19.3 10.3 15.8 9 12 9Z" />
    </svg>
  );
}
