import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        navy: { 950: "#0b1424", 900: "#0f1d33", 800: "#172a47", 700: "#22395e", 600: "#2f4b78", 100: "#e6ecf5", 50: "#f3f6fb" },
        ink: { 900: "#16191f", 700: "#2c313a", 500: "#5b6270", 400: "#808897", 300: "#b4bac5", 200: "#dde1e7", 100: "#eef0f3", 50: "#f7f8fa" },
      },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
    },
  },
  plugins: [],
} satisfies Config;
