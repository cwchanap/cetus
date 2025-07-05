/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        orbitron: ['Orbitron', 'monospace'],
        inter: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite',
        holographic: 'holographic 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 5px rgb(34 211 238 / 0.5))' },
          '50%': {
            filter:
              'drop-shadow(0 0 20px rgb(34 211 238 / 0.8)) drop-shadow(0 0 30px rgb(34 211 238 / 0.6))',
          },
        },
        holographic: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      boxShadow: {
        'glow-cyan':
          '0 0 20px rgb(34 211 238 / 0.3), 0 0 40px rgb(34 211 238 / 0.2), 0 0 60px rgb(34 211 238 / 0.1)',
        'glow-purple':
          '0 0 20px rgb(168 85 247 / 0.3), 0 0 40px rgb(168 85 247 / 0.2), 0 0 60px rgb(168 85 247 / 0.1)',
        'glow-pink':
          '0 0 20px rgb(236 72 153 / 0.3), 0 0 40px rgb(236 72 153 / 0.2), 0 0 60px rgb(236 72 153 / 0.1)',
      },
      textShadow: {
        'neon-cyan':
          '0 0 5px rgb(34 211 238), 0 0 10px rgb(34 211 238), 0 0 15px rgb(34 211 238)',
        'neon-purple':
          '0 0 5px rgb(168 85 247), 0 0 10px rgb(168 85 247), 0 0 15px rgb(168 85 247)',
      },
    },
  },
  plugins: [
    function ({ addUtilities, addComponents, theme }) {
      const newUtilities = {
        // Sci-fi text effects
        '.text-holographic': {
          background:
            'linear-gradient(45deg, rgb(34 211 238), rgb(168 85 247), rgb(236 72 153), rgb(34 211 238))',
          backgroundSize: '200% 200%',
          '-webkit-background-clip': 'text',
          'background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
          animation: 'holographic 3s ease-in-out infinite',
        },
        '.text-neon-cyan': {
          color: 'rgb(34 211 238)',
          textShadow:
            '0 0 5px rgb(34 211 238), 0 0 10px rgb(34 211 238), 0 0 15px rgb(34 211 238)',
        },
        '.text-neon-purple': {
          color: 'rgb(168 85 247)',
          textShadow:
            '0 0 5px rgb(168 85 247), 0 0 10px rgb(168 85 247), 0 0 15px rgb(168 85 247)',
        },
        // Sci-fi backgrounds
        '.bg-sci-fi-dark': {
          background:
            'linear-gradient(135deg, rgb(15 23 42), rgb(88 28 135), rgb(15 23 42))',
        },
        '.bg-glass': {
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
        '.bg-glass-strong': {
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        },
        // Sci-fi borders and glows
        '.border-neon': {
          border: '1px solid rgba(34, 211, 238, 0.5)',
          boxShadow: '0 0 10px rgba(34, 211, 238, 0.25)',
        },
        '.border-neon-purple': {
          border: '1px solid rgba(168, 85, 247, 0.5)',
          boxShadow: '0 0 10px rgba(168, 85, 247, 0.25)',
        },
        '.glow-cyan': {
          boxShadow:
            '0 0 20px rgba(34, 211, 238, 0.3), 0 0 40px rgba(34, 211, 238, 0.2), 0 0 60px rgba(34, 211, 238, 0.1)',
        },
        '.glow-purple': {
          boxShadow:
            '0 0 20px rgba(168, 85, 247, 0.3), 0 0 40px rgba(168, 85, 247, 0.2), 0 0 60px rgba(168, 85, 247, 0.1)',
        },
        '.glow-pink': {
          boxShadow:
            '0 0 20px rgba(236, 72, 153, 0.3), 0 0 40px rgba(236, 72, 153, 0.2), 0 0 60px rgba(236, 72, 153, 0.1)',
        },
        // Hover effects
        '.hover-glow-cyan:hover': {
          boxShadow:
            '0 0 20px rgba(34, 211, 238, 0.3), 0 0 40px rgba(34, 211, 238, 0.2), 0 0 60px rgba(34, 211, 238, 0.1)',
        },
        '.hover-glow-purple:hover': {
          boxShadow:
            '0 0 20px rgba(168, 85, 247, 0.3), 0 0 40px rgba(168, 85, 247, 0.2), 0 0 60px rgba(168, 85, 247, 0.1)',
        },
        // Custom scrollbar
        '.scrollbar-sci-fi': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgb(34 211 238) rgb(30 41 59)',
        },
        '.scrollbar-sci-fi::-webkit-scrollbar': {
          width: '8px',
        },
        '.scrollbar-sci-fi::-webkit-scrollbar-track': {
          background: 'rgba(30, 41, 59, 0.5)',
        },
        '.scrollbar-sci-fi::-webkit-scrollbar-thumb': {
          background:
            'linear-gradient(180deg, rgb(34 211 238), rgb(168 85 247))',
          borderRadius: '4px',
        },
        '.scrollbar-sci-fi::-webkit-scrollbar-thumb:hover': {
          background:
            'linear-gradient(180deg, rgb(103 232 249), rgb(196 181 253))',
        },
      }
      addUtilities(newUtilities)
    },
  ],
}
