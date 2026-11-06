import { useEffect, useRef, type PointerEvent } from 'react'
import { constrainPhotoView, zoomPhotoView, type PhotoView } from './photoComposition'

type Point = { x: number; y: number }
type Gesture = { view: PhotoView; point: Point; distance: number }

interface Props {
  view: PhotoView
  onChange: (view: PhotoView) => void
  onZoomBy: (delta: number) => void
}

export default function PhotoGestures({ view, onChange, onZoomBy }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    // 原生非被动监听器允许滚轮缩放时阻止页面滚动。
    function wheel(event: WheelEvent) {
      if (!event.deltaY) return
      event.preventDefault()
      onZoomBy(event.deltaY < 0 ? 0.05 : -0.05)
    }
    surface.addEventListener('wheel', wheel, { passive: false })
    return () => surface.removeEventListener('wheel', wheel)
  }, [onZoomBy])

  function rebase() {
    const [first, second] = [...pointers.current.values()]
    gesture.current = first ? {
      view,
      point: first,
      distance: second ? Math.hypot(first.x - second.x, first.y - second.y) : 0,
    } : null
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const [first, second] = [...pointers.current.values()]
    const start = gesture.current
    if (second && start.distance > 0) {
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      onChange(zoomPhotoView(start.view, start.view.zoom * distance / start.distance))
    } else if (!second) {
      const bounds = event.currentTarget.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      onChange(constrainPhotoView({
        ...start.view,
        x: start.view.x + (first.x - start.point.x) / bounds.width,
        y: start.view.y + (first.y - start.point.y) / bounds.height,
      }))
    }
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    if (pointers.current.delete(event.pointerId)) rebase()
  }

  return (
    <div
      ref={surfaceRef}
      className="photo-gestures"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        rebase()
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    />
  )
}
