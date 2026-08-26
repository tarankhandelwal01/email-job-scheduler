import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1E9E4C",
          light: "#E6F4EA",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
