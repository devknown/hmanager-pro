/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '480px',
        'sm': '600px'
      },
      colors: {
        gw: {
          bg: '#f8fafc',
          yellow: '#3b82f6',
          pink: '#eb79ba',
          mint: '#e8f1fd',
          bluePill: '#e8f1fd',
          blueText: '#2563eb'
        }
      }
    },
  },
  plugins: [],
};
