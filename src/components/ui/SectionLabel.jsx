import { sectionLabel as sectionLabelStyle } from '../../styles/theme'

export default function SectionLabel({ children, style = {} }) {
  return <p style={{ ...sectionLabelStyle, ...style }}>{children}</p>
}
