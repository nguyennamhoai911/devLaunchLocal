/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0f1117',
          secondary: '#1a1d26',
          tertiary: '#21263a',
          card: '#1a1d26',
          hover: '#21263a',
        },
        border: {
          DEFAULT: '#2a2f3a',
          light: '#3a4050',
        },
        accent: {
          DEFAULT: '#00ff9c',
          dark: '#00d47f',
          muted: '#00ff9c33',
          glow: '0 0 20px #00ff9c66',
        },
        purple: {
          accent: '#a855f7',
          muted: '#a855f733',
        },
        blue: {
          accent: '#3b82f6',
          muted: '#3b82f633',
        },
        danger: {
          DEFAULT: '#ff4d4f',
          dark: '#cc3a3c',
          muted: '#ff4d4f22',
        },
        warning: {
          DEFAULT: '#f59e0b',
          muted: '#f59e0b22',
        },
        text: {
          primary: '#e8eaf0',
          secondary: '#8892a4',
          muted: '#4a5568',
        },
        status: {
          online: '#00ff9c',
          stopped: '#ff4d4f',
          starting: '#f59e0b',
          errored: '#ff6b6b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'neon-green': '0 0 20px rgba(0, 255, 156, 0.3)',
        'neon-green-sm': '0 0 10px rgba(0, 255, 156, 0.2)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.6)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 156, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 156, 0.5)' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
