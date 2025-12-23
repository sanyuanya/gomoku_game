import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1b18",
        parchment: "#f4efe5",
        ember: "#d65a31",
        moss: "#2a5c4b",
        slate: "#3c4856",
        gold: "#c8a35f"
      },
      boxShadow: {
        panel: "0 8px 24px rgba(28, 27, 24, 0.12)",
        float: "0 16px 40px rgba(28, 27, 24, 0.18)"
      },
      fontFamily: {
        display: ["Georgia", "Times New Roman", "Times", "serif"],
        body: ["Trebuchet MS", "Verdana", "sans-serif"]
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" }
        }
      },
      animation: {
        fadeUp: "fadeUp 400ms ease-out",
        pulseSoft: "pulseSoft 1.6s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
