/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Rampa completa de la marca (azul #0055FF como DEFAULT).
        // Usar SIEMPRE primary-* en vez de blue-* de Tailwind: son azules distintos.
        "primary": {
          DEFAULT: "#0055FF",
          50:  "#EEF4FF",
          100: "#D9E6FF",
          200: "#B3CCFF",
          300: "#80AAFF",
          400: "#4D88FF",
          500: "#1A66FF",
          600: "#0055FF",
          700: "#0044CC",
          800: "#003399",
          900: "#002266",
        },
        "secondary": "#3B82F6",

        // Acentos con DOS tonos, y la distinción importa.
        //
        // Estos colores se usaban a la vez de relleno y de texto con un único
        // valor, y como texto no se leían: el ámbar #F59E0B sobre blanco da
        // 2.15:1 y sobre su propio badge amber-100 baja a 1.87:1, cuando el
        // mínimo legible es 4.5:1. El color de ALERTA del sistema era el peor
        // de todos — un aviso que no se lee no avisa.
        //
        //   DEFAULT → rellenos y bordes (bg-*, border-*): vivo, se ve.
        //   ink     → texto e iconos sobre fondo claro: ≥4.5:1.
        "accent-green":  { DEFAULT: "#10B981", ink: "#047857" },  // 2.5:1 → 4.8:1
        "accent-red":    { DEFAULT: "#EF4444", ink: "#B91C1C" },  // 3.8:1 → 6.5:1
        "accent-orange": { DEFAULT: "#F59E0B", ink: "#B45309" },  // 2.2:1 → 5.0:1
        "accent-purple": { DEFAULT: "#8B5CF6", ink: "#6D28D9" },
        // Lienzo de la página. Era #F3F4F6, un gris de catálogo sin relación
        // con la marca; ahora lleva una pizca del azul propio. Y va algo más
        // oscuro a propósito: es lo que permite que las tarjetas blancas se
        // lean SIN borde. Separación con el blanco 1.13 — suficiente para que
        // la superficie flote sola.
        "canvas": "#EDF1F9",

        // Relleno sutil dentro de las tarjetas (chips de icono, filas al
        // pasar el ratón). Un punto por encima del lienzo para que no se
        // confunda con él.
        "background-light": "#F1F4FA",
        "background-dark": "#0f0f23",
        "surface": "#FFFFFF",
        "border-color": "#E5E7EB",
        "text-main": "#111827",

        // Era #6B7280 (gray-500): 4.39:1 sobre el gris de fondo, por debajo
        // del mínimo, y la mitad de este sistema son etiquetas y ejes a 11px.
        // gray-600 sube a 6.7:1 sobre el lienzo y 7.6:1 sobre blanco, y sigue
        // muy por debajo del text-main (17.7:1): la jerarquía se mantiene.
        "text-secondary": "#4B5563"
      },
      fontFamily: {
        // Inter, no Manrope: Manrope estaba declarada aquí pero no se cargaba
        // en ningún sitio, y además tope 800 — el `font-black` (900) que usan
        // las cifras grandes se lo inventaba el navegador engordando trazos.
        // Inter tiene el 900 de verdad y numerales tabulares de serie.
        "display": ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },

      // Un peldaño más abajo de `xs`. La mitad de este sistema son etiquetas,
      // subtítulos y ejes a 11px que se escribían como `text-[11px]`: valor
      // arbitrario repetido 18 veces solo en el inicio. Con nombre deja de ser
      // una decisión que se toma otra vez en cada plantilla.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],   // 11px
      },
      boxShadow: {
        'soft': '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 1px 4px -1px rgba(0, 0, 0, 0.03)',

        // Sombra de las tarjetas SIN borde. Sustituye al `border` en su papel
        // de "aquí empieza una superficie": el borde de 1px repetido 331 veces
        // en el front es lo que le daba el aire de plantilla administrativa.
        // Difuminado corto (6px) a propósito: borde + sombra ancha a la vez es
        // el look de tarjeta fantasma, y aquí ya no hay borde que acompañar.
        'card': '0 1px 2px rgba(16, 24, 40, 0.04), 0 2px 6px -1px rgba(16, 24, 40, 0.06)',
        'card-hover': '0 2px 4px rgba(16, 24, 40, 0.05), 0 6px 14px -3px rgba(16, 24, 40, 0.10)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
