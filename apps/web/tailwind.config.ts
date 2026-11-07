import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";
import { darkPalette } from "./src/constants/darkPalette";

const slateSteps = Object.keys(darkPalette);

function slateVariables(palette: Record<string, string>) {
  return Object.fromEntries(
    slateSteps.map((step) => {
      const hex = palette[step];
      const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
      return [`--slate-${step}`, rgb.join(" ")];
    })
  );
}

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211d",
        mint: "#dff8ea",
        pine: "#176b52",
        coral: "#f97359",
        slate: Object.fromEntries(
          slateSteps.map((step) => [step, `rgb(var(--slate-${step}) / <alpha-value>)`])
        )
      }
    }
  },
  plugins: [
    // `.dark` must follow `:root`: both selectors have equal specificity.
    plugin(({ addBase }) => {
      addBase({ ":root": slateVariables(colors.slate) });
      addBase({ ".dark": slateVariables(darkPalette) });
    })
  ]
} satisfies Config;
