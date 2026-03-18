/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: '#3AA8A4', dark: '#0A2220' },
        bbb: {
          yellow: '#E8A820',
          orange: '#D45820',
          red: '#C03020',
          green: '#00B14F',
        }
      }
    }
  },
  plugins: []
}
