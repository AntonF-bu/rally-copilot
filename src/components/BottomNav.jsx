// Bottom Navigation Tab Bar
// Tabs: Home, Discover, Profile

const tabs = [
  {
    id: 'home',
    label: 'Home',
    // Home icon
    icon: (props) => (
      <svg width={props.size || 22} height={props.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
  },
  {
    id: 'discover',
    label: 'Discover',
    // Compass icon
    icon: (props) => (
      <svg width={props.size || 22} height={props.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
      </svg>
    )
  },
  {
    id: 'profile',
    label: 'Profile',
    // User icon
    icon: (props) => (
      <svg width={props.size || 22} height={props.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    )
  },
]

export function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav
      className="fixed left-0 right-0 z-50"
      style={{
        bottom: 0,
        // Ensure it's at actual bottom on mobile
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'rgba(10, 10, 15, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Tab buttons */}
      <div className="flex justify-around items-center py-3 px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center gap-1 px-6 py-1 transition-all"
              style={{
                color: isActive ? '#00d4ff' : 'rgba(255, 255, 255, 0.5)',
              }}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
              <span
                className="text-xs"
                style={{
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: '0.02em',
                }}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
