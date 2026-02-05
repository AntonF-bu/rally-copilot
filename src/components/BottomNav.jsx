// Bottom Navigation Tab Bar
// Tabs: Home, Discover, Profile
import { colors, fonts, transitions } from '../styles/theme'

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
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'rgba(6, 10, 19, 0.88)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderTop: `1px solid ${colors.glassBorder}`,
      }}
    >
      {/* Tab buttons */}
      <div className="flex justify-around items-center py-2.5 px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center gap-1 px-6 py-1"
              style={{
                color: isActive ? colors.accent : colors.textMuted,
                transition: transitions.snappy,
              }}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: '10px',
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
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
