import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button, DirectionalArrow, Pagination, SettingsToggle, SheikahTextTitle } from 'zelda-hyrule-ui'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Text, Circle } from 'react-konva'
import type Konva from 'konva'
import './App.css'
import { colors } from './theme'
import { readCaptureDate, resolveImageDate } from './photoDate'

const SETTINGS_PAGES = ['Basic']
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

function App() {
  // 图片只保存在浏览器内存中；两个 ref 分别指向预览容器和隐藏的文件输入框。
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })

  const [recorded, setRecorded] = useState(false)
  // 追踪框的位置以画布宽高的比例保存，窗口缩放后仍指向图片的同一区域。
  const [targetPosition, setTargetPosition] = useState({ x: 0.5, y: 0.5 })
  // 宽、高分别按图片短边保存；默认仍是原来的 28% 正方形。
  const [targetSize, setTargetSize] = useState({ width: 0.28, height: 0.28 })
  const [fileName, setFileName] = useState('')
  const [imageDate, setImageDate] = useState<string | null>(null)
  const [targetName, setTargetName] = useState('Unknown')
  const [compressedExport, setCompressedExport] = useState(false)
  const [settingsPage, setSettingsPage] = useState(0)

  const stageRef = useRef<Konva.Stage>(null)
  const resizeLayerRef = useRef<Konva.Layer>(null)
  const uploadRequestRef = useRef(0)
  const resizeRef = useRef<{ oppositeX: number; oppositeY: number; corner: Corner } | null>(null)


  // 容器宽度变化时更新画布；取整可避免小数像素触发反复重绘。
  useEffect(() => {
    const element = previewRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width)
      const height = Math.floor(entry.contentRect.height)
      setPreviewSize((previous) =>
        previous.width === width  && previous.height === height
        ? previous
        : { width, height })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // 取宽、高两个方向允许的较小缩放比例；1 表示不放大原图。
  const previewScale = image
    ? Math.min(
        previewSize.width / image.naturalWidth,
        previewSize.height / image.naturalHeight,
        1,
      )
    : 0
  const canvasWidth = image ? image.naturalWidth * previewScale : 0
  const canvasHeight = image ? image.naturalHeight * previewScale : 0
  // 按短边计算装饰尺寸，让横图和竖图的取景框视觉比例接近。
  const shortEdge = Math.min(canvasWidth, canvasHeight)
  const inset = shortEdge * 0.06 // 固定框距图片边缘的距离
  const arm = shortEdge * 0.08 // 固定框每个角的线长

  const boxWidth = shortEdge * targetSize.width
  const boxHeight = shortEdge * targetSize.height
  // 滑块表示宽、高中占对应图片边比例较大的那一项。
  const sizePercent = canvasWidth && canvasHeight
    ? 100 * Math.max(boxWidth / canvasWidth, boxHeight / canvasHeight)
    : 28
  const minFrameSide = shortEdge * MIN_FRAME_SIZE
  // 长方形缩小时仍保持长宽比，同时不能把较短的一边缩得无法操作。
  const sliderMin = boxWidth && boxHeight
    ? Math.max(12, sizePercent * minFrameSide / Math.min(boxWidth, boxHeight))
    : 12
  const trackingArm = Math.min(boxWidth, boxHeight) * 0.18

  // 装饰尺寸随预览画布缩放，导出到原图尺寸后保持相同的视觉比例。
  // 以画布短边 600px 时的原有尺寸作为基准。
  const overlayScale = shortEdge / 600
  const lineWidth = 2 * overlayScale
  // Zoom 标尺与固定框共用左边线；长度跟随短边缩放并保持垂直居中。
  const zoomHeight = shortEdge * 0.28
  const zoomTop = (canvasHeight - zoomHeight) / 2
  const zoomCap = 5 * overlayScale

  // 名称区域的最小宽度随画布缩放，但不能超过画布；它与追踪框共用中心点。
  const labelWidth = Math.min(canvasWidth, Math.max(boxWidth, 140 * overlayScale))
  const labelHeight = 26 * overlayScale
  const labelFontSize = 14 * overlayScale
  const horizontalHalf = Math.max(boxWidth, labelWidth) / 2
  const resizeHitRadius = clamp(16 * overlayScale, 12, 20)

  // 名称默认与上边缘居中；贴近顶部时改与下边缘居中，避免被画布裁切。
  function nameOffsetY(centerY: number) {
    const atTop = centerY - boxHeight / 2 < labelHeight / 2
    return atTop
      ? boxHeight / 2 - labelHeight / 2
      : -boxHeight / 2 - labelHeight / 2
  }

  // 将比例坐标换算成画布像素，并限制追踪框本身在可见区域内。
  const targetX = clamp(targetPosition.x * canvasWidth, horizontalHalf, canvasWidth - horizontalHalf)
  const targetY = clamp(targetPosition.y * canvasHeight, boxHeight / 2, canvasHeight - boxHeight / 2)
  // 外侧固定框始终为希卡蓝，只有追踪框和名称随记录状态变色。
  const trackingColor = recorded ? colors.sheikah : colors.orange
  // 预览与下载共用同一个文件名，避免名称、日期或格式不一致。
  const exportName = (targetName.trim() || 'Unknown').replace(/[\\/:*?"<>|]/g, '_')
  const exportFileName = `${exportName}-${imageDate ?? 'PhotoDate'}.${compressedExport ? 'jpg' : 'png'}`

  // 在本地读取文件，等图片解码完成后再交给 Konva 绘制。
  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const requestId = ++uploadRequestRef.current
    const captureDate = readCaptureDate(file).catch(() => null)
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = async () => {
        const date = await captureDate
        if (requestId !== uploadRequestRef.current) return
        setImage(img)
        setFileName(file.name)
        setImageDate(resolveImageDate(date, file.lastModified))
        setTargetPosition({ x: 0.5, y: 0.5 })
        setTargetSize({ width: 0.28, height: 0.28 })
        // 新图片载入时按格式设置导出默认值；之后仍可手动切换。
        setCompressedExport(file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  function handleTargetMove(event: Konva.KonvaEventObject<DragEvent>) {
    // 拖动中也同步位置，让独立编辑层的四个手柄始终跟随追踪框。
    setTargetPosition({
      x: event.target.x() / canvasWidth,
      y: event.target.y() / canvasHeight,
    })
  }

  function handleSizeChange(nextPercent: number) {
    // 统一乘同一比例，滑块不会把自由调整的长方形改回正方形。
    const scale = nextPercent / sizePercent
    setTargetSize(({ width, height }) => ({ width: width * scale, height: height * scale }))
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

  function handleExport() {
    if (!image || !canvasWidth || !stageRef.current) return

    const sourceLongEdge = Math.max(image.naturalWidth, image.naturalHeight)
    const outputScale = compressedExport
      ? Math.min(1, 2560 / sourceLongEdge)
      : 1
    // 当前画布按窗口缩小显示；导出时放大回原图像素宽度
    const pixelRatio = (image.naturalWidth / canvasWidth) * outputScale
    // 操作手柄只属于编辑界面，不参与导出的画面。
    resizeLayerRef.current?.hide()
    let canvas: HTMLCanvasElement
    try {
      canvas = stageRef.current.toCanvas({ pixelRatio })
    } finally {
      resizeLayerRef.current?.show()
    }
    const mimeType = compressedExport ? 'image/jpeg' : 'image/png'

    canvas.toBlob((blob) => {
      if (!blob) {
        window.alert('Exported failed')
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }, mimeType, compressedExport ? 0.88 : undefined)
  }

  return (
    <main className="editor">
      <section className="controls">
        <SheikahTextTitle title="SlateLens" description="Sheikah camera frame editor"  />

        <div className="settings-page">
          {settingsPage === 0 && (
            <>
              {/* 记录状态决定追踪框与识别提示的颜色。 */}
              <div className="control-group status-buttons" role="group" aria-label="图鉴状态">
                <Button
                  size="small"
                  variant={recorded ? 'ghost' : 'primary'}
                  className={!recorded ? 'status-unrecorded-active' : undefined}
                  aria-pressed={!recorded}
                  onClick={() => setRecorded(false)}
                >Unrecorded</Button>
                <Button
                  size="small"
                  variant={recorded ? 'sheikah' : 'ghost'}
                  className={recorded ? 'status-recorded-active' : undefined}
                  aria-pressed={recorded}
                  onClick={() => setRecorded(true)}
                >Recorded</Button>
              </div>
              {/* UI 库按钮触发隐藏的原生文件输入框。 */}
              <div className="control-group upload-control">
                <span className="control-label">Choose a picture</span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                  hidden
                />

                <Button
                  size="small"
                  variant="sheikah"
                  block
                  onClick={() => fileInputRef.current?.click()}
                >
                  {image ? 'Change picture': 'Select picture'}
                </Button>

                <small className="control-hint file-name">{fileName || 'Your picture stays in this browser'}</small>
              </div>
              {/* 名称输入和大小滑块会立即反映在画布上。 */}
              <div className="control-group name-control">
                <label htmlFor="target-name">Target Name</label>
                <input
                  id="target-name"
                  type="text"
                  maxLength={24}
                  value={targetName}
                  onChange={(event) => setTargetName(event.target.value)}
                  placeholder="Enter a name"
                />
              </div>
              <div className="control-group size-control">
                <label htmlFor="box-size">
                  <span>Tracking frame size</span>
                  <strong>{Math.round(sizePercent)}%</strong>
                </label>
                <input
                  id="box-size"
                  type="range"
                  min={sliderMin}
                  max={MAX_FRAME_SIZE * 100}
                  step="any"
                  value={sizePercent}
                  disabled={!image}
                  onChange={(event) => handleSizeChange(Number(event.target.value))}
                />
              </div>
              <div className="control-group compression-control">
                <SettingsToggle
                  className="compression-toggle"
                  label="Compress export"
                  options={['OFF', 'ON']}
                  value={compressedExport ? 'ON' : 'OFF'}
                  onChange={(value) => setCompressedExport(value === 'ON')}
                />
                <small className="control-hint">ON: JPG · long edge up to 2560px</small>
              </div>
            </>
          )}
        </div>
        {SETTINGS_PAGES.length > 1 && (
          <nav className="settings-pager" aria-label="Settings pages">
            <Button
              size="small"
              variant="ghost"
              className="pager-arrow"
              aria-label="Previous settings page"
              disabled={settingsPage === 0}
              onClick={() => setSettingsPage((page) => Math.max(0, page - 1))}
            >
              <DirectionalArrow direction="left" size={18} />
            </Button>
            <div className="pager-current">
              <span>{SETTINGS_PAGES[settingsPage]}</span>
              <Pagination totalPages={SETTINGS_PAGES.length} currentPage={settingsPage + 1} />
            </div>
            <Button
              size="small"
              variant="ghost"
              className="pager-arrow"
              aria-label="Next settings page"
              disabled={settingsPage === SETTINGS_PAGES.length - 1}
              onClick={() => setSettingsPage((page) => Math.min(SETTINGS_PAGES.length - 1, page + 1))}
            >
              <DirectionalArrow direction="right" size={18} />
            </Button>
          </nav>
        )}
        {/* 导出按钮 */}
        <div className="export-control">
          <Button size="small" variant="sheikah" block disabled={!image} onClick={handleExport}>
            {compressedExport ? 'Export JPG' : 'Export PNG'}
          </Button>
          <small className="control-hint file-name">Export filename: {exportFileName}</small>
        </div>
      </section>

      <section className="preview" ref={previewRef}>
        { image && canvasWidth > 0 ? (
          <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}>
            <Layer>
              {/* 图层顺序：原图 → 固定取景框 → 可拖动追踪框与名称。 */}
              <KonvaImage image={image} width={canvasWidth} height={canvasHeight} />
              <Group opacity={0.45} listening={false}>
                <Line points={[inset + arm, inset, inset, inset, inset, inset + arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
                <Line points={[canvasWidth - inset - arm, inset, canvasWidth - inset, inset, canvasWidth - inset, inset + arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
                <Line points={[inset + arm, canvasHeight - inset, inset, canvasHeight - inset, inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
                <Line points={[canvasWidth - inset - arm, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
              </Group>
              {/* Zoom 标尺比四角更清晰，暂时只作装饰，不改变图片缩放。 */}
              <Group opacity={0.8} listening={false}>
                <Text
                  x={inset - 26 * overlayScale}
                  y={zoomTop - 22 * overlayScale}
                  width={52 * overlayScale}
                  text="Zoom"
                  align="center"
                  fontSize={14 * overlayScale}
                  fontStyle="bold"
                  fill={colors.sheikah}
                />
                <Line points={[inset, zoomTop, inset, zoomTop + zoomHeight]} stroke={colors.sheikah} strokeWidth={1.5 * overlayScale} />
                <Line points={[inset - zoomCap, zoomTop, inset + zoomCap, zoomTop]} stroke={colors.sheikah} strokeWidth={1.5 * overlayScale} />
                <Line points={[inset - zoomCap, zoomTop + zoomHeight, inset + zoomCap, zoomTop + zoomHeight]} stroke={colors.sheikah} strokeWidth={1.5 * overlayScale} />
                <Line
                  points={[
                    inset - 12 * overlayScale, zoomTop + zoomHeight * 0.18 - 5 * overlayScale,
                    inset - 5 * overlayScale, zoomTop + zoomHeight * 0.18,
                    inset - 12 * overlayScale, zoomTop + zoomHeight * 0.18 + 5 * overlayScale,
                  ]}
                  closed
                  fill={colors.sheikah}
                />
              </Group>
              {/* Group 内的元素一起拖动；名称在贴近顶部时切到下边缘。 */}
              <Group
                x={targetX}
                y={targetY}
                draggable
                dragBoundFunc={(point) => ({
                  x: Math.max(
                    horizontalHalf,
                    Math.min(canvasWidth - horizontalHalf, point.x),
                  ),
                  y: Math.max(
                    boxHeight / 2,
                    Math.min(canvasHeight - boxHeight / 2, point.y),
                  ),
                })}
                onDragMove={handleTargetMove}
                onDragEnd={handleTargetMove}
              >
                {/* 透明命中区域保留框内拖动能力，不会出现在导出图片中。 */}
                <Rect
                  x={-boxWidth / 2}
                  y={-boxHeight / 2}
                  width={boxWidth}
                  height={boxHeight}
                  fill="transparent"
                />
                {/* 名称与当前边缘居中，颜色与追踪框一致。 */}
                <Text
                  x={-labelWidth / 2}
                  y={nameOffsetY(targetY)}
                  width={labelWidth}
                  height={labelHeight}
                  text={targetName.trim() || 'Unknown'}
                  align="center"
                  verticalAlign="middle"
                  fontSize={labelFontSize}
                  fill={trackingColor}
                  ellipsis
                  wrap="none"
                />
                {/* 只绘制方框四角，保留原来的框尺寸与拖动边界。 */}
                <Line points={[-boxWidth / 2 + trackingArm, -boxHeight / 2, -boxWidth / 2, -boxHeight / 2, -boxWidth / 2, -boxHeight / 2 + trackingArm]} stroke={trackingColor} strokeWidth={lineWidth} listening={false} />
                <Line points={[boxWidth / 2 - trackingArm, -boxHeight / 2, boxWidth / 2, -boxHeight / 2, boxWidth / 2, -boxHeight / 2 + trackingArm]} stroke={trackingColor} strokeWidth={lineWidth} listening={false} />
                <Line points={[-boxWidth / 2 + trackingArm, boxHeight / 2, -boxWidth / 2, boxHeight / 2, -boxWidth / 2, boxHeight / 2 - trackingArm]} stroke={trackingColor} strokeWidth={lineWidth} listening={false} />
                <Line points={[boxWidth / 2 - trackingArm, boxHeight / 2, boxWidth / 2, boxHeight / 2, boxWidth / 2, boxHeight / 2 - trackingArm]} stroke={trackingColor} strokeWidth={lineWidth} listening={false} />
              </Group>
            </Layer>
            <Layer ref={resizeLayerRef}>
              {/* 透明命中区覆盖四个角；可拖拽区域比细线更适合触屏操作。 */}
              {([
                { x: -1, y: -1 }, { x: 1, y: -1 },
                { x: -1, y: 1 }, { x: 1, y: 1 },
              ] as Corner[]).map((corner) => (
                <Circle
                  key={`${corner.x},${corner.y}`}
                  x={targetX + corner.x * boxWidth / 2}
                  y={targetY + corner.y * boxHeight / 2}
                  radius={resizeHitRadius}
                  fill="transparent"
                  draggable
                  onMouseEnter={(event) => {
                    const stage = event.target.getStage()
                    if (stage) stage.container().style.cursor = corner.x === corner.y ? 'nwse-resize' : 'nesw-resize'
                  }}
                  onMouseLeave={(event) => {
                    const stage = event.target.getStage()
                    if (stage) stage.container().style.cursor = 'default'
                  }}
                  onDragStart={(event) => {
                    event.cancelBubble = true
                    resizeRef.current = {
                      oppositeX: targetX - corner.x * boxWidth / 2,
                      oppositeY: targetY - corner.y * boxHeight / 2,
                      corner,
                    }
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true
                    handleResizeMove(event)
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true
                    handleResizeMove(event)
                    resizeRef.current = null
                  }}
                />
              ))}
            </Layer>
          </Stage>
        ): (
          <p>After uploaded, preview the image here.</p>
        )}
      </section>
    </main>
  )
}

export default App
