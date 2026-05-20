import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211d",
        mint: "#dff8ea",
        pine: "#176b52",
        coral: "#f97359"
      }
    }
  },
  plugins: []
} satisfies Config;
