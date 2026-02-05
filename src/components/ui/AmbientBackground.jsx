export default function AmbientBackground() {
  return (
    <>
      {/* Ambient orange glow — top right */}
      <div style={{
        position: 'fixed', top: '-250px', right: '-200px',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(255,107,53,0.035) 0%, transparent 65%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* Ambient cyan glow — bottom left */}
      <div style={{
        position: 'fixed', bottom: '-150px', left: '-150px',
        width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(0,212,255,0.02) 0%, transparent 65%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* Center diffused glow */}
      <div style={{
        position: 'fixed', top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px', height: '400px',
        background: 'radial-gradient(ellipse, rgba(255,107,53,0.012) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
    </>
  )
}
