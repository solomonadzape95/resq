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
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k.digit}
            type="button"
            onClick={() => onKey(k.digit)}
            className="flex h-14 flex-col items-center justify-center rounded-full bg-neutral-800 text-neutral-100 transition active:scale-95 active:bg-neutral-700"
          >
            <span className="text-2xl font-semibold leading-none">{k.digit}</span>
            {k.letters ? (
              <span className="mt-0.5 text-[10px] font-medium tracking-widest text-neutral-500">
                {k.letters}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCall}
          disabled={!callEnabled || callActive}
          className="flex h-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg shadow-green-900/40 transition active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500 disabled:shadow-none"
        >
          <CallIcon />
        </button>
        <button
          type="button"
          onClick={onHangup}
          disabled={!callActive}
          className="flex h-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 transition active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500 disabled:shadow-none"
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
