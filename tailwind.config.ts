import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07090d",
        panel: "#11161f",
        line: "#1e2734",
        grass: "#1f8a4c",
        gold: "#e4c56b",
      },
    },
  },
  plugins: [],
};

export default config;
