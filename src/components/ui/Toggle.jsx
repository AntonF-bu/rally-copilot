import { toggle as toggleColors, transitions } from '../../styles/theme'

export default function Toggle({ enabled, onChange, disabled = false }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      style={{
        position: 'relative',
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        border: 'none',
        padding: 0,
        transition: transitions.smooth,
        background: enabled ? toggleColors.activeColor : toggleColors.inactiveColor,
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      disabled={disabled}
    >
      <div
        style={{
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          width: '20px',
          height: '20px',
          background: toggleColors.thumbColor,
          borderRadius: '50%',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          transition: transitions.smooth,
        }}
      />
    </button>
  )
}
