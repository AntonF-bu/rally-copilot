/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'rally-dark': '#0a0a0f',
        'rally-card': '#12121a',
        'rally-cyan': '#00d4ff',
        'rally-orange': '#ff6b35',
        'rally-yellow': '#ffd500',
        'rally-red': '#ff3366',
        'rally-green': '#00ff88',
      },
      fontFamily: {
        'display': ['Orbitron', 'system-ui', 'sans-serif'],
        'body': ['Rajdhani', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'sweep': 'sweep 4s linear infinite',
      },
      keyframes: {
        sweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        }
      }
    },
  },
  plugins: [],
}
