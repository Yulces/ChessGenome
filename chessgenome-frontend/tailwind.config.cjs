/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.webpack.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        genome: {
          orange: '#e85d04',
          green: '#4a7c1e',
          dark: '#f5f5f5',
          card: '#ffffff',
        },
      },
    },
  },
  plugins: [],
};
