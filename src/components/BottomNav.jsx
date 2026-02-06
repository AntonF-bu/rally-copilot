// Bottom Navigation Tab Bar - Tramo Brand Identity
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

// Tramo Brand Colors
const colors = {
  bg: '#0A0A0A',
  border: '#1A1A1A',
  active: '#E8622C',
  inactive: '#666666',
}

export function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: colors.bg,
        borderTop: `1px solid ${colors.border}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
              className="flex flex-col items-center gap-1.5 px-6 py-1"
              style={{
                color: isActive ? colors.active : colors.inactive,
                transition: 'color 0.2s ease',
              }}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '10px',
                  fontWeight: isActive ? 500 : 400,
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
