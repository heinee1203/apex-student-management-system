/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#2C5F6E',
          navy: '#1E3A44',
          steel: '#6B9DB5',
          slate: '#8A9EA8',
          light: '#E8EDF0',
          offwhite: '#F4F6F8',
          border: '#D6DDE2',
        },
        status: {
          success: '#2E8B6A',
          warning: '#D4913B',
          danger: '#C0504D',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
