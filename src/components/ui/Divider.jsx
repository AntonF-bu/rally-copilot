import { dividerStyle } from '../../styles/theme'

export default function Divider({ style = {} }) {
  return <div style={{ ...dividerStyle, margin: '6px 0 18px', ...style }} />
}
