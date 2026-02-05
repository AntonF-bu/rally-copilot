// ShareModal - Share route link modal

export default function ShareModal({ name, onClose }) {
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    onClose()
  }

  return (
    <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a24] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-white mb-4">Share Route</h3>
        <p className="text-white/60 text-sm mb-4">{name || 'Rally Route'}</p>
        <button
          onClick={copyLink}
          className="w-full py-3 bg-orange-500 text-black font-bold rounded-xl mb-2"
        >
          Copy Link
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 bg-white/10 text-white rounded-xl"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
