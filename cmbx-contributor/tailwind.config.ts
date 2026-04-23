import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        amber: '#f0c040',
        bid: '#66ff88',
        ask: '#ff6666',
        dealer: '#4488ff',
        muted: '#555555',
        'border-color': '#222222',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
