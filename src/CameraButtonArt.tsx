import { useId } from 'react'

const hintBlack = '#050504'

const keys = [
  { key: 'x', x: 0, y: -56, barX: -146, barY: -140, width: 292, textX: 0, textY: -112, fade: 'both' },
  { key: 'y', x: -56, y: 0, barX: -330, barY: -27.5, width: 245, textX: -110, textY: 0, fade: 'left' },
  { key: 'a', x: 56, y: 0, barX: 85, barY: -27.5, width: 245, textX: 110, textY: 0, fade: 'right' },
  { key: 'b', x: 0, y: 56, barX: -146, barY: 85, width: 292, textX: 0, textY: 112, fade: 'both' },
] as const

type ButtonHints = Record<(typeof keys)[number]['key'], string>

export default function CameraButtonArt({ labels }: { labels: ButtonHints }) {
  const id = useId()
  return (
    <svg className="camera-button-art" viewBox="-106 -106 212 212" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-both`}>
          <stop stopColor={hintBlack} stopOpacity="0" /><stop stopColor={hintBlack} offset=".28" /><stop stopColor={hintBlack} offset=".72" /><stop stopColor={hintBlack} offset="1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-left`}>
          <stop stopColor={hintBlack} stopOpacity="0" /><stop stopColor={hintBlack} offset=".65" />
        </linearGradient>
        <linearGradient id={`${id}-right`}>
          <stop stopColor={hintBlack} offset=".35" /><stop stopColor={hintBlack} offset="1" stopOpacity="0" />
        </linearGradient>
        {keys.map(({ key, x, y }) => (
          <mask key={key} id={`${id}-cut-${key}`} maskUnits="userSpaceOnUse" x="-106" y="-106" width="212" height="212">
            <rect x="-106" y="-106" width="212" height="212" fill="white" />
            <circle cx={x} cy={y} r="55" fill="black" />
          </mask>
        ))}
      </defs>
      <defs>
        <g id={`${id}-idle`} fontSize="43" fontWeight="600" textAnchor="middle" dominantBaseline="central">
          {keys.map(({ key, x, y }) => <circle key={key} cx={x} cy={y} r="44" fill="#31302b" />)}
          {keys.map(({ key, x, y }) => <text key={key} x={x} y={y} fill="#6e6c63">{key.toUpperCase()}</text>)}
        </g>
      </defs>
      <use className="camera-art-idle" href={`#${id}-idle`} />
      {keys.map(({ key, x, y, barX, barY, width, textX, textY, fade }) => (
        <g key={key} className={`camera-art-state camera-art-${key}`}>
          {/* 渐变条和黑色外圈先画，圆心与文字各自在同一坐标系内定位。 */}
          <use href={`#${id}-idle`} mask={`url(#${id}-cut-${key})`} />
          <rect x={barX} y={barY} width={width} height="55" fill={`url(#${id}-${fade})`} />
          <circle cx={x} cy={y} r="50" fill={hintBlack} />
          <circle cx={x} cy={y} r="31.5" fill="#e2ded3" />
          <text x={x} y={y} fill={hintBlack} fontSize="43" fontWeight="700" textAnchor="middle" dominantBaseline="central">{key.toUpperCase()}</text>
          <text x={textX} y={textY} fill="#ece4d2" fontSize="40" fontStyle="italic" fontWeight="600"
            textAnchor={key === 'y' ? 'end' : key === 'a' ? 'start' : 'middle'} dominantBaseline="central">{labels[key]}</text>
        </g>
      ))}
    </svg>
  )
}
