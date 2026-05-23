"use client";

const KEYS: Array<{ digit: string; letters?: string }> = [
  { digit: "1" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*" },
  { digit: "0", letters: "+" },
  { digit: "#" },
];

export interface KeypadProps {
  onKey: (digit: string) => void;
  onCall: () => void;
  onHangup: () => void;
  callEnabled: boolean;
  callActive: boolean;
}

export function Keypad({ onKey, onCall, onHangup, callEnabled, callActive }: KeypadProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((k) => (
          <button
            key={k.digit}
            type="button"
            onClick={() => onKey(k.digit)}
            className="btn-press group relative flex h-14 flex-col items-center justify-center rounded-full bg-gradient-to-b from-neutral-800 to-neutral-900 text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:from-neutral-700 hover:to-neutral-800 active:from-neutral-900 active:to-neutral-950"
          >
            <span className="text-2xl font-semibold leading-none tabular-nums">
              {k.digit}
            </span>
            {k.letters ? (
              <span className="mt-0.5 text-[9px] font-semibold tracking-[0.2em] text-neutral-500">
                {k.letters}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onCall}
          disabled={!callEnabled || callActive}
          className="btn-press flex h-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/50 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600 disabled:shadow-none"
          aria-label="Call"
        >
          <CallIcon />
        </button>
        <button
          type="button"
          onClick={onHangup}
          disabled={!callActive}
          className="btn-press flex h-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/50 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600 disabled:shadow-none"
          aria-label="Hang up"
        >
          <HangupIcon />
        </button>
      </div>
    </div>
  );
}

function CallIcon() {
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
