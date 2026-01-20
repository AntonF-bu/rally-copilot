// ActionButton - Reusable icon button for actions

const ICONS = {
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  reverse: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  ),
  fly: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
    </svg>
  ),
  voice: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  ),
  share: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
}

export default function ActionButton({
  icon,
  onClick,
  disabled = false,
  success = false,
  loading = false,
  tip,
  highlight = false,
}) {
  const baseClasses = 'w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40'

  let stateClasses = 'bg-black/60 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white'

  if (success) {
    stateClasses = 'bg-green-500/20 text-green-400 border border-green-500/30'
  } else if (highlight) {
    stateClasses = 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tip}
      className={`${baseClasses} ${stateClasses}`}
    >
      {loading ? (
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        ICONS[icon]
      )}
    </button>
  )
}
