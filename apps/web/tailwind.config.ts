import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-satoshi)", ...defaultTheme.fontFamily.sans],
        mono: defaultTheme.fontFamily.mono,
      },
      colors: {
        resq: {
          red: "#dc2626",
          "red-dim": "#7f1d1d",
          "red-soft": "#fca5a5",
          orange: "#ea580c",
          blue: "#2563eb",
          yellow: "#ca8a04",
          dark: "#0a0a0a",
          // Slightly lifted surface tone for cards over the dark base —
          // matches the reference's "almost-black-with-a-hint-of-warmth"
          // panel feel without flattening into pure neutral-950.
          panel: "#121212",
          "panel-2": "#171717",
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
        "ring-shake": "ring-shake 0.7s ease-in-out infinite",
        "fade-up": "fade-up 200ms ease-out",
        "card-pop": "card-pop 200ms ease-out",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.5)", opacity: "1" },
          "100%": { transform: "scale(2.5)", opacity: "0" },
        },
        "ring-shake": {
          "0%, 100%": { transform: "rotate(-12deg)" },
          "20%": { transform: "rotate(12deg)" },
          "40%": { transform: "rotate(-8deg)" },
          "60%": { transform: "rotate(8deg)" },
          "80%": { transform: "rotate(-4deg)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "card-pop": {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(4px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
