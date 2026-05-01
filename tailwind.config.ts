import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: "var(--theme-surface)",
        elevated: "var(--theme-surface-elevated)",
        background: "var(--theme-background)",
        foreground: "var(--theme-foreground)",
        subtle: "var(--theme-text-secondary)",
        alice: "var(--palette-alice)",
        yale: "var(--palette-yale)",
        cerulean: "var(--palette-cerulean)",
        baby: "var(--palette-baby)",
        battleship: "var(--palette-battleship)",
        muted: {
          DEFAULT: "var(--theme-muted)",
          fg: "var(--theme-text-secondary)",
        },
        border: {
          DEFAULT: "var(--theme-border)",
          subtle: "var(--theme-border-subtle)",
        },
        /* Haptimize-style sidebar tokens — primary = emerald CTA; foreground = text on primary */
        primary: {
          DEFAULT: "var(--theme-primary)",
          light: "var(--theme-primary-light)",
          foreground: "var(--theme-primary-foreground)",
        },
        accent: "var(--theme-accent)",
        "neutral-dark": "var(--theme-foreground)",
        "neutral-light": "var(--theme-background)",
        error: "var(--theme-error)",
        "error-bg": "var(--theme-error-bg)",
        /* Marketing + app dark theme — same tokens as `globals.css` `.dark` / scroll tour `#101219` */
        landing: {
          void: "#0a0c12",
          deep: "#0f1219",
          surface: "#101219",
          raised: "#151a24",
          card: "#1a1f2c",
          border: "#2a3140",
          line: "#3f3f46",
          fg: "#fafafa",
          muted: "#a1a1aa",
          dim: "#71717a",
          accent: "#22c55e",
          "accent-soft": "#4ade80",
          glow: "rgba(34, 197, 94, 0.45)",
          iris: "#8b5cf6",
          "iris-soft": "rgba(139, 92, 246, 0.35)",
        },
      },
      fontFamily: {
        sans: ["var(--font-ibm-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      letterSpacing: {
        /* Brand: IBM Plex Sans at -7% (em tracks font size) */
        brand: "-0.07em",
      },
      fontSize: {
        /* Slightly roomier than Tailwind defaults — tiny copy was too tight with global -0.07em body tracking. */
        xs: ["0.75rem", { lineHeight: "1.1875rem", letterSpacing: "-0.03em" }],
        sm: ["0.875rem", { lineHeight: "1.4rem", letterSpacing: "-0.055em" }],
      },
      keyframes: {
        "landing-marquee-l": {
          "0%": { transform: "translate3d(0,0,0)" },
          "100%": { transform: "translate3d(-50%,0,0)" },
        },
        "landing-marquee-r": {
          "0%": { transform: "translate3d(-50%,0,0)" },
          "100%": { transform: "translate3d(0,0,0)" },
        },
      },
      animation: {
        "landing-marquee-l": "landing-marquee-l 62s linear infinite",
        "landing-marquee-r": "landing-marquee-r 70s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
