/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f0ff',
          100: '#e0e0ff',
          200: '#c4c6ff',
          300: '#a2a1ff',
          400: '#8272fa',
          500: '#6d5af4',
          600: '#5e3de8',
          700: '#4f2fcd',
          800: '#4028a5',
          900: '#372783',
        },
      },
    },
  },
  plugins: [],
}