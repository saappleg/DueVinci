module.exports = {
  content: {
    relative: true,
    files: ['./**/*.html', './js/**/*.js'],
  },
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          900: '#151515',
          800: '#1c1c1c',
          700: '#2b2b2b',
          600: '#3f3f3f',
        },
      },
    },
  },
};
