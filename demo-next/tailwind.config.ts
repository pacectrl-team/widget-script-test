import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        tide: '#0f172a',
        kelp: '#0b7a57',
        foam: '#e0f2f1',
        foamDark: '#c5e7e3',
      },
      fontFamily: {
        display: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 12px 32px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
