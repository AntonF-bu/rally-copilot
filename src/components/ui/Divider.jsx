// Divider component - Tramo Brand Design

export default function Divider({ style = {} }) {
  return (
    <div style={{
      height: '1px',
      background: '#1A1A1A',
      margin: '6px 0 18px',
      ...style,
    }} />
  )
}
