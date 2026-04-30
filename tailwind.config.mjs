/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        luxury: {
          black: '#1A1A1A',
          'dark-1': '#0d0d0d',
          'dark-2': '#1a1a1a',
          'dark-3': '#2d2d2d',
          'gray-1': '#333333',
          'gray-2': '#555555',
          'gray-3': '#999999',
          'gray-4': '#aaaaaa',
          'gray-5': '#cccccc',
          'gray-6': '#E5E5E5',
          light: '#F9F9F9',
          'page-bg': '#EBEBEB',
          white: '#ffffff',
          accent: '#C5A278',
        },
        chart: {
          'gold-1': '#F5E6D3',
          'gold-2': '#E8D4B8',
          'gold-3': '#DCC49E',
          'gold-4': '#D4BC96',
          'gold-5': '#C5A278',
          'gold-6': '#B08F60',
          'gold-7': '#A68552',
          'gold-8': '#967545',
          'gold-9': '#8B6D3F',
          'gold-10': '#7A5F35',
          'gray-1': '#EBEBEB',
          'gray-2': '#D5D5D5',
          'gray-3': '#BEBEBE',
          'gray-4': '#A3A3A3',
          'gray-5': '#888888',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'Trebuchet MS', 'Arial', 'sans-serif'],
      },
      fontSize: {
        xs: '12px',
        sm: '13px',
        base: '14px',
        lg: '16px',
        xl: '18px',
        '2xl': '22px',
        '3xl': '28px',
        '4xl': '34px',
        '5xl': '46px',
        '6xl': '58px',
        '7xl': '70px',
        '8xl': '94px',
        '9xl': '126px',
      },
      letterSpacing: {
        luxury: '0.05em',
        'luxury-wide': '0.1em',
      },
      spacing: {
        header: '104px',
      },
    },
  },
  plugins: [],
}
export default config
