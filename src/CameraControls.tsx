import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_PHOTO_ZOOM, MIN_PHOTO_ZOOM, type CameraAction, type PhotoView } from './photoComposition'
import CameraButtonArt from './CameraButtonArt'
import './CameraControls.css'

interface Props {
  view?: PhotoView
  onAction: (action: CameraAction) => void
  onConfirm: () => void
  onCancel: () => void
}

const KEY_ACTIONS: Record<string, CameraAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  '+': 'zoomIn', '=': 'zoomIn', x: 'zoomIn', X: 'zoomIn',
  '-': 'zoomOut', _: 'zoomOut', y: 'zoomOut', Y: 'zoomOut',
}

export default function CameraControls({ view, onAction, onConfirm, onCancel }: Props) {
  const [pressed, setPressed] = useState<CameraAction[]>([])
  const held = useRef(new Map<string, { action: CameraAction; since: number }>())
  const timer = useRef<number | null>(null)

  const stop = useCallback((source?: string) => {
    if (source) held.current.delete(source)
    else held.current.clear()
    if (!held.current.size && timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    setPressed([...held.current.values()].map(({ action }) => action))
  }, [])

  const start = useCallback((source: string, action: CameraAction) => {
    if (held.current.has(source)) return
    held.current.set(source, { action, since: performance.now() })
    setPressed([...held.current.values()].map((entry) => entry.action))
    onAction(action)
    if (timer.current !== null) return
    // 先执行一次；按住 300ms 后连续执行，松开最后一个按键就停止计时。
    timer.current = window.setInterval(() => {
      const actions = new Set([...held.current.values()]
        .filter(({ since }) => performance.now() - since >= 300)
        .map((entry) => entry.action))
      actions.forEach(onAction)
    }, 75)
  }, [onAction])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const field = target.closest('input, textarea, select')
        if (target.isContentEditable) return
        // 已聚焦的交互控件保留原生 Enter 行为。
        if (event.key === 'Enter' && target.closest('button, a[href], [role="button"], summary')) return
        if (field instanceof HTMLInputElement && field.type === 'range') {
          // 标尺聚焦时方向键保留原生行为，Enter / Esc 和缩放快捷键仍可使用。
          if (event.key.startsWith('Arrow')) return
        } else if (field) return
      }
      const action = KEY_ACTIONS[event.key]
      if (action) {
        event.preventDefault()
        if (!event.repeat) start(`key:${event.code}`, action)
      } else if (['Enter', 'a', 'A', 'Escape', 'b', 'B'].includes(event.key)) {
        event.preventDefault()
        if (!event.repeat) {
          stop()
          if (['Enter', 'a', 'A'].includes(event.key)) onConfirm()
          else onCancel()
        }
      }
    }
    function keyup(event: KeyboardEvent) { stop(`key:${event.code}`) }
    function clear() { stop() }
    function focus(event: FocusEvent) {
      if (event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target.closest('input, textarea, select'))) stop()
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    document.addEventListener('focusin', focus)
    // 退出编辑时清理全部监听器和计时器。
    const holds = held.current
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
      document.removeEventListener('focusin', focus)
      holds.clear()
      if (timer.current !== null) window.clearInterval(timer.current)
      timer.current = null
    }
  }, [start, stop, onConfirm, onCancel])

  function holdProps(action: CameraAction) {
    return {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        start(`pointer:${event.pointerId}`, action)
      },
      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => stop(`pointer:${event.pointerId}`),
      onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => stop(`pointer:${event.pointerId}`),
      onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => stop(`pointer:${event.pointerId}`),
      // 键盘 Space 和辅助技术会生成 detail 为 0 的点击。
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.detail === 0) onAction(action)
      },
    }
  }

  const labels = view
    ? { x: 'Zoom in', y: 'Zoom out', a: 'Confirm', b: 'Cancel' }
    : { x: 'Enlarge', y: 'Shrink', a: 'Confirm', b: 'Cancel' }

  return (
    <div className="camera-console" role="group" aria-label={view ? "Composition controls" : "Tracking frame controls"}>
      {/* 暂时隐藏页面十字键；键盘方向键仍由快捷键监听器处理。
      {view && <div className="camera-dpad" role="group" aria-label="Pan view">
        <svg className="dpad-base" viewBox="0 0 90 90" aria-hidden="true" focusable="false">
          <rect x="30" width="30" height="90" rx="5.5" />
          <rect y="30" width="90" height="30" rx="5.5" />
        </svg>
        {(['up', 'left', 'right', 'down'] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            className={`camera-key dpad-${direction}${pressed.includes(direction) ? ' is-pressed' : ''}`}
            aria-label={`Pan view ${direction}`}
            aria-keyshortcuts={`Arrow${direction[0].toUpperCase()}${direction.slice(1)}`}
            title={`Pan view ${direction} (arrow key) · Hold to repeat`}
            aria-disabled={view.zoom <= MIN_PHOTO_ZOOM}
            {...holdProps(direction)}
          >
            <span className="dpad-mark" aria-hidden="true" />
          </button>
        ))}
      </div>}
      */}
      <div className="camera-abxy" role="group" aria-label="Zoom and finish">
        <CameraButtonArt labels={labels} />
        {([
          { letter: 'X', action: 'zoomIn', label: labels.x, shortcut: 'X +' },
          { letter: 'Y', action: 'zoomOut', label: labels.y, shortcut: 'Y -' },
        ] as const).map(({ letter, action, label, shortcut }) => (
          <button
            key={letter}
            type="button"
            className={`camera-key camera-letter key-${letter.toLowerCase()}${pressed.includes(action) ? ' is-pressed' : ''}`}
            aria-label={view ? label : `${label} tracking frame`}
            aria-keyshortcuts={shortcut}
            aria-disabled={view ? (action === 'zoomIn' ? view.zoom >= MAX_PHOTO_ZOOM : view.zoom <= MIN_PHOTO_ZOOM) : undefined}
            {...holdProps(action)}
           />
        ))}
        <button type="button" className="camera-key camera-letter key-a" aria-label={`${labels.a} ${view ? 'composition' : 'tracking frame'}`} aria-keyshortcuts="Enter A" onClick={() => { stop(); onConfirm() }} />
        <button type="button" className="camera-key camera-letter key-b" aria-label={`${labels.b} ${view ? 'composition' : 'tracking frame changes'}`} aria-keyshortcuts="Escape B" onClick={() => { stop(); onCancel() }} />
      </div>
    </div>
  )
}
