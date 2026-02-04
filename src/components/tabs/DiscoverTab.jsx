// Discover Tab - Placeholder for marketplace
// Coming soon feature

export function DiscoverTab() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div
        className="p-4 rounded-full mb-4"
        style={{ background: 'rgba(0, 212, 255, 0.1)' }}
      >
        {/* Compass icon */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#00d4ff"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"/>
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Discover Routes
      </h2>
      <p className="text-white/50 max-w-xs">
        Find amazing drives shared by the community. Coming soon.
      </p>
    </div>
  )
}
