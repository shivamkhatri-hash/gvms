/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ongc: {
          blue: "#003366",       // Primary Cobalt Blue
          blueLight: "#004080",  // Hover Blue
          blueDark: "#002244",   // Active Header Blue
          orange: "#D97706",     // Secondary Accent Amber/Orange
          amberLight: "#FEF3C7",
          bg: "#F8FAFC",         // Clean Light slate background
          card: "#FFFFFF",       // White card background
          border: "#E2E8F0",     // Subtle border slate
          textPrimary: "#0F172A",
          textSecondary: "#64748B"
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace']
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.03)',
        'premium': '0 20px 25px -5px rgba(0, 51, 102, 0.08), 0 8px 10px -6px rgba(0, 51, 102, 0.04)'
      }
    },
  },
  plugins: [],
}
