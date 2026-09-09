/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ONYX POS System brand palette (red & white)
        brand: {
          DEFAULT: '#DC2626',
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
          900: '#881337',
        },
        onyx: {
          50: '#FFFFFF',
          100: '#FFF7F4',
          200: '#F8F5F2',
          300: '#E8E4DF',
          400: '#C9C4BF',
          500: '#A39E99',
          600: '#7A7570',
          700: '#57524D',
          800: '#3B3836',
          900: '#1F1E1D',
        },
        // Backwards-compatible remap of the legacy "sky" scale to the red ramp,
        // so every existing sky-* utility instantly becomes red-themed.
        sky: {
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
          900: '#881337',
          950: '#4C0519',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        glass: '0 20px 55px rgba(31, 30, 29, 0.16)',
        'glass-sm': '0 10px 30px rgba(31, 30, 29, 0.10)',
        'glow-red': '0 10px 30px rgba(220, 38, 38, 0.25)',
      },
      animation: {
        'fade-in': 'onyxFadeIn 0.35s ease-out',
        'slide-up': 'onyxSlideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        'pop-in': 'onyxPopIn 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'onyxShimmer 1.8s ease-in-out infinite',
      },
      keyframes: {
        onyxFadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        onyxSlideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        onyxPopIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '60%': { opacity: '1', transform: 'scale(1.03)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        onyxShimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
    },
  },
  plugins: [],
};
