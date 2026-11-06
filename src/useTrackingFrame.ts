import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import type { CameraAction } from './photoComposition'

const INITIAL_FRAME_POSITION = { x: 0.5, y: 0.5 }
const INITIAL_FRAME_SIZE = { width: 0.28, height: 0.28 }

// 追踪框的宽、高都不能小于图片短边的 12%，避免缩得太小。
const MIN_FRAME_SIZE = 0.12
// 宽最多占图片宽度的 90%，高最多占图片高度的 90%。
const MAX_FRAME_SIZE = 0.9

// 用正负方向标记四个角：x 为左 / 右，y 为上 / 下。
type Corner = { x: -1 | 1; y: -1 | 1 }

// 把数值限制在 min～max 范围内，用于防止追踪框越界或尺寸超限。
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function boundPosition(point: { x: number; y: number }, canvasWidth: number, canvasHeight: number, horizontalHalf: number, halfHeight: number) {
  return {
    x: clamp(point.x, horizontalHalf, canvasWidth - horizontalHalf),
    y: clamp(point.y, halfHeight, canvasHeight - halfHeight),
  }
}

export function useTrackingFrame(canvasWidth: number, canvasHeight: number) {
  const shortEdge = Math.min(canvasWidth, canvasHeight)
  const overlayScale = shortEdge / 600
  // 追踪框的位置以画布宽高的比例保存，窗口缩放后仍指向图片的同一区域。
  const [targetPosition, setTargetPosition] = useState(INITIAL_FRAME_POSITION)
  // 宽、高分别按图片短边保存；默认仍是原来的 28% 正方形。
  const [targetSize, setTargetSize] = useState(INITIAL_FRAME_SIZE)
  const [trackingEditing, setTrackingEditing] = useState(true)
  const trackingSnapshot = useRef({ position: INITIAL_FRAME_POSITION, size: INITIAL_FRAME_SIZE })
  const resizeRef = useRef<{ oppositeX: number; oppositeY: number; corner: Corner } | null>(null)


  const confirmTracking = useCallback(() => setTrackingEditing(false), [])
  const exitTracking = useCallback(() => {
    setTargetPosition(trackingSnapshot.current.position)
    setTargetSize(trackingSnapshot.current.size)
    setTrackingEditing(false)
  }, [])

  function begin() {
    trackingSnapshot.current = { position: targetPosition, size: targetSize }
    setTrackingEditing(true)
  }

  function reset() {
    setTargetPosition(INITIAL_FRAME_POSITION)
    setTargetSize(INITIAL_FRAME_SIZE)
    trackingSnapshot.current = { position: INITIAL_FRAME_POSITION, size: INITIAL_FRAME_SIZE }
    resizeRef.current = null
    setTrackingEditing(true)
  }

  const boxWidth = shortEdge * targetSize.width
  const boxHeight = shortEdge * targetSize.height
  const minFrameSide = shortEdge * MIN_FRAME_SIZE
  const trackingBounds = useRef({ halfWidth: 0, halfHeight: 0 })
  const adjustTracking = useCallback((action: CameraAction) => {
    if (!shortEdge) return
    if (action !== 'zoomIn' && action !== 'zoomOut') {
      const { halfWidth, halfHeight } = trackingBounds.current
      const step = 0.01
      setTargetPosition(({ x, y }) => {
        const current = boundPosition({ x: x * canvasWidth, y: y * canvasHeight }, canvasWidth, canvasHeight, halfWidth, halfHeight)
        const next = boundPosition({
          x: current.x + (action === 'left' ? -step : action === 'right' ? step : 0) * canvasWidth,
          y: current.y + (action === 'up' ? -step : action === 'down' ? step : 0) * canvasHeight,
        }, canvasWidth, canvasHeight, halfWidth, halfHeight)
        return { x: next.x / canvasWidth, y: next.y / canvasHeight }
      })
      return
    }
    // 两条边使用同一倍率，且各自遵守原有最小边长和最大画幅比例。
    setTargetSize(({ width, height }) => {
      const min = MIN_FRAME_SIZE / Math.min(width, height)
      const max = MAX_FRAME_SIZE * Math.min(canvasWidth / (shortEdge * width), canvasHeight / (shortEdge * height))
      const scale = clamp(action === 'zoomIn' ? 1.05 : 1 / 1.05, min, max)
      return { width: width * scale, height: height * scale }
    })
  }, [canvasHeight, canvasWidth, shortEdge])
  const trackingArm = Math.min(boxWidth, boxHeight) * 0.18

  // 名称区域的最小宽度随画布缩放，但不能超过画布；它与追踪框共用中心点。
  const labelWidth = Math.min(canvasWidth, Math.max(boxWidth, 140 * overlayScale))
  const labelHeight = 26 * overlayScale
  const labelFontSize = 14 * overlayScale
  const horizontalHalf = Math.max(boxWidth, labelWidth) / 2
  // 同步拖动边界，保持按键回调稳定，让长按不因框位置或大小变化而中断。
  useEffect(() => {
    trackingBounds.current = { halfWidth: horizontalHalf, halfHeight: boxHeight / 2 }
  }, [horizontalHalf, boxHeight])

  function boundDrag(point: { x: number; y: number }) {
    return boundPosition(point, canvasWidth, canvasHeight, horizontalHalf, boxHeight / 2)
  }

  const resizeHitRadius = clamp(16 * overlayScale, 12, 20)

  // 名称默认与上边缘居中；贴近顶部时改与下边缘居中，避免被画布裁切。
  function nameOffsetY(centerY: number) {
    const atTop = centerY - boxHeight / 2 < labelHeight / 2
    return atTop
      ? boxHeight / 2 - labelHeight / 2
      : -boxHeight / 2 - labelHeight / 2
  }

  const { x: targetX, y: targetY } = boundDrag({
    x: targetPosition.x * canvasWidth,
    y: targetPosition.y * canvasHeight,
  })

  function startResize(corner: Corner) {
    resizeRef.current = {
      oppositeX: targetX - corner.x * boxWidth / 2,
      oppositeY: targetY - corner.y * boxHeight / 2,
      corner,
    }
  }

  function endResize(event: Konva.KonvaEventObject<DragEvent>) {
    handleResizeMove(event)
    resizeRef.current = null
  }

  function handleTargetMove(event: Konva.KonvaEventObject<DragEvent>) {
    // 拖动中也同步位置，让独立编辑层的四个手柄始终跟随追踪框。
    setTargetPosition({
      x: event.target.x() / canvasWidth,
      y: event.target.y() / canvasHeight,
    })
  }

  function handleResizeMove(event: Konva.KonvaEventObject<DragEvent>) {
    const resize = resizeRef.current
    if (!resize || !shortEdge) return

    const point = event.target.absolutePosition()
    const { oppositeX, oppositeY, corner } = resize
    // 对角固定；四角可以独立改变宽高，但不能越过图片边缘或翻转。
    const labelMinWidth = Math.min(canvasWidth, 140 * overlayScale)
    const availableWidth = corner.x > 0 ? canvasWidth - oppositeX : oppositeX
    // 先限制宽度，让居中的名称也能放下；不再通过移动中心点挤进画布。
    const minWidth = Math.max(minFrameSide, labelMinWidth - 2 * (canvasWidth - availableWidth))
    const maxWidth = Math.min(MAX_FRAME_SIZE * canvasWidth, availableWidth, 2 * availableWidth - labelMinWidth)
    const maxHeight = Math.min(MAX_FRAME_SIZE * canvasHeight, corner.y > 0 ? canvasHeight - oppositeY : oppositeY)
    const width = clamp(corner.x * (point.x - oppositeX), minWidth, maxWidth)
    const height = clamp(corner.y * (point.y - oppositeY), minFrameSide, maxHeight)
    const centerX = oppositeX + corner.x * width / 2
    const centerY = oppositeY + corner.y * height / 2

    // Konva 会先移动手柄；即使受限后的状态没变化，也要把它移回实际角点。
    event.target.absolutePosition({
      x: oppositeX + corner.x * width,
      y: oppositeY + corner.y * height,
    })

    setTargetSize({ width: width / shortEdge, height: height / shortEdge })
    setTargetPosition({ x: centerX / canvasWidth, y: centerY / canvasHeight })
  }

  return {
    trackingEditing, begin, reset, confirmTracking, exitTracking, adjustTracking,
    boxWidth, boxHeight, trackingArm, labelWidth, labelHeight, labelFontSize,
    resizeHitRadius, nameOffsetY, targetX, targetY, boundDrag,
    handleTargetMove, startResize, handleResizeMove, endResize,
  }
}
