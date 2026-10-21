/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  // Only apply hover styles on devices that can really hover (stops sticky hover on phones).
  future: { hoverOnlyWhenSupported: true },
  plugins: [],
};
