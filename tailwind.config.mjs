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
          'light': '#F9F9F9',
          white: '#ffffff',
          accent: '#C5A278',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'Trebuchet MS', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'xs': '12px',
        'sm': '13px',
        'base': '14px',
        'lg': '16px',
        'xl': '18px',
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
        'header': '104px',
      },
    },
  },
  plugins: [],
}
export default config
