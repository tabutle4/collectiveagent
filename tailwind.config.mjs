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
          black: '#000000',
          'dark-1': '#0d0d0d',
          'dark-2': '#1a1a1a',
          'dark-3': '#2d2d2d',
          'gray-1': '#333333',
          'gray-2': '#666666',
          'gray-3': '#999999',
          'gray-4': '#aaaaaa',
          'gray-5': '#cccccc',
          'light': '#f8f8f8',
          white: '#ffffff',
          gold: '#C9A961', // Soft champagne gold accent
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'Trebuchet MS', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'xs': '10px',      // was 12px (0.75rem)
        'sm': '12px',       // was 14px (0.875rem)
        'base': '14px',     // was 16px (1rem)
        'lg': '16px',       // was 18px (1.125rem)
        'xl': '18px',       // was 20px (1.25rem)
        '2xl': '22px',      // was 24px (1.5rem)
        '3xl': '28px',      // was 30px (1.875rem)
        '4xl': '34px',      // was 36px (2.25rem)
        '5xl': '46px',      // was 48px (3rem)
        '6xl': '58px',      // was 60px (3.75rem)
        '7xl': '70px',      // was 72px (4.5rem)
        '8xl': '94px',      // was 96px (6rem)
        '9xl': '126px',     // was 128px (8rem)
      },
      letterSpacing: {
        luxury: '0.05em',
        'luxury-wide': '0.1em',
      },
    },
  },
  plugins: [],
}

export default config
