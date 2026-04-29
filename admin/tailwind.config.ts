import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0F1A",
        panel: "#111827",
        panel2: "#1F2937",
        line: "#1F2937",
        text: "#E5E7EB",
        subtext: "#9CA3AF",
        accent: "#FCA5A5",
        accent2: "#FFE4E6",
        good: "#34D399",
        warn: "#FBBF24",
        bad: "#F87171",
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
