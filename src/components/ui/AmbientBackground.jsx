// AmbientBackground component - Tramo Brand Design
// Subtle topographic texture with warm orange accent

export default function AmbientBackground() {
  return (
    <>
      {/* Topographic texture layer - using Tramo orange (#E8622C) */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='600' height='600' xmlns='http://www.w3.org/2000/svg'%3E%3Cg%3E%3Cpath d='M65 270c22-58 80-108 152-115s137 22 174 80 29 130-14 180-108 80-180 72-115-36-144-94-7-80 12-123z' fill='none' stroke='rgba(232,98,44,0.04)' stroke-width='0.8' stroke-linecap='round'/%3E%3Cpath d='M90 262c17-44 62-84 120-90s107 17 136 62 23 102-11 140-84 62-140 56-90-28-112-73-6-62 7-95z' fill='none' stroke='rgba(255,255,255,0.03)' stroke-width='0.7' stroke-linecap='round'/%3E%3Cpath d='M114 254c13-32 47-63 90-67s80 13 102 47 17 77-8 106-63 47-106 42-68-21-84-55-5-47 6-73z' fill='none' stroke='rgba(255,255,255,0.025)' stroke-width='0.6' stroke-linecap='round'/%3E%3Cpath d='M136 248c10-24 35-47 67-50s60 10 77 36 13 58-6 79-48 35-79 32-51-16-64-42-4-35 5-55z' fill='none' stroke='rgba(232,98,44,0.025)' stroke-width='0.5' stroke-linecap='round'/%3E%3Cpath d='M155 244c7-17 26-34 50-37s44 7 56 26 9 42-5 58-35 26-58 23-37-12-47-30-3-26 4-40z' fill='none' stroke='rgba(255,255,255,0.02)' stroke-width='0.4' stroke-linecap='round'/%3E%3Cpath d='M410 88c29-36 72-50 115-36s72 50 80 94-7 86-43 108-80 22-108 0-50-43-58-80-14-50 14-86z' fill='none' stroke='rgba(255,255,255,0.035)' stroke-width='0.7' stroke-linecap='round'/%3E%3Cpath d='M432 102c22-27 54-37 86-27s54 38 60 71-5 65-32 81-60 16-81 0-38-32-43-60-11-38 10-65z' fill='none' stroke='rgba(232,98,44,0.03)' stroke-width='0.6' stroke-linecap='round'/%3E%3Cpath d='M452 116c16-19 39-27 63-19s39 27 43 51-4 47-24 59-43 12-59 0-27-24-31-43-8-27 8-48z' fill='none' stroke='rgba(255,255,255,0.025)' stroke-width='0.5' stroke-linecap='round'/%3E%3Cpath d='M30 440c36-22 86-29 130-14s80 50 86 94-14 86-50 108-86 17-122-7-58-58-60-100-20-58 16-81z' fill='none' stroke='rgba(255,255,255,0.03)' stroke-width='0.7' stroke-linecap='round'/%3E%3Cpath d='M56 452c26-16 63-21 95-10s58 37 63 69-10 63-37 79-63 12-89-5-42-42-44-73-15-42 12-60z' fill='none' stroke='rgba(232,98,44,0.03)' stroke-width='0.6' stroke-linecap='round'/%3E%3Cpath d='M80 462c18-11 44-15 66-7s40 26 44 48-7 44-26 55-44 9-62-4-29-29-31-51-10-29 9-41z' fill='none' stroke='rgba(255,255,255,0.025)' stroke-width='0.5' stroke-linecap='round'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '600px 600px',
      }} />

      {/* Subtle orange glow - top right - using Tramo orange */}
      <div style={{
        position: 'fixed', top: '-250px', right: '-200px',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(232,98,44,0.025) 0%, transparent 65%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
    </>
  )
}
