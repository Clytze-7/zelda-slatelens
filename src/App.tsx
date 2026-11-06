import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button, DialogChoice, DirectionalArrow, Pagination, SettingsToggle, SheikahTextTitle } from 'zelda-hyrule-ui'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Text, Circle } from 'react-konva'
import type Konva from 'konva'
import './App.css'
import { colors } from './theme'
import { readCaptureDate, resolveImageDate } from './photoDate'
import CameraControls from './CameraControls'
import PhotoGestures from './PhotoGestures'
import { getPhotoCrop, MIN_PHOTO_ZOOM, MAX_PHOTO_ZOOM } from './photoComposition'
import { usePhotoComposition } from './usePhotoComposition'
import { useTrackingFrame } from './useTrackingFrame'

const SETTINGS_PAGES = ['Basic']
const PREVIEW_MODES = [
  { label: 'Tracking frame', value: 'tracking' },
  { label: 'Adjust picture', value: 'picture' },
]
function App() {
  // 图片只保存在浏览器内存中；两个 ref 分别指向预览容器和隐藏的文件输入框。
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })

  const [recorded, setRecorded] = useState(false)
  const [fileName, setFileName] = useState('')
  const [imageDate, setImageDate] = useState<string | null>(null)
  const [targetName, setTargetName] = useState('Unknown')
  const [compressedExport, setCompressedExport] = useState(false)
  const [settingsPage, setSettingsPage] = useState(0)
  const composition = usePhotoComposition()
  const { view, isComposing, cancel: cancelComposition } = composition
  const stageRef = useRef<Konva.Stage>(null)
  const resizeLayerRef = useRef<Konva.Layer>(null)
  const uploadRequestRef = useRef(0)
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

  // 装饰尺寸随预览画布缩放，导出到原图尺寸后保持相同的视觉比例。
  // 以画布短边 600px 时的原有尺寸作为基准。
  const overlayScale = shortEdge / 600
  const lineWidth = 2 * overlayScale
  // Zoom 标尺位置固定；倍率越大，三角指示点越靠上。
  const zoomHeight = shortEdge * 0.28
  const zoomTop = (canvasHeight - zoomHeight) / 2
  const zoomCap = 5 * overlayScale
  const zoomMarkerY = zoomTop + zoomHeight * (1 - (view.zoom - MIN_PHOTO_ZOOM) / (MAX_PHOTO_ZOOM - MIN_PHOTO_ZOOM))

  const tracking = useTrackingFrame(canvasWidth, canvasHeight)
  const {
    trackingEditing, begin: beginTracking, reset: resetTracking, confirmTracking, exitTracking,
    adjustTracking, boxWidth, boxHeight, trackingArm, labelWidth, labelHeight, labelFontSize,
    resizeHitRadius, nameOffsetY, targetX, targetY, boundDrag, handleTargetMove,
    startResize, handleResizeMove, endResize,
  } = tracking
  const cancelPicture = useCallback(() => {
    cancelComposition()
    confirmTracking()
  }, [cancelComposition, confirmTracking])

  useEffect(() => {
    const container = stageRef.current?.container()
    if (container && (isComposing || !trackingEditing)) container.style.cursor = ''
  }, [isComposing, trackingEditing])
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
        resetTracking()
        composition.reset()
        // 新图片载入时按格式设置导出默认值；之后仍可手动切换。
        setCompressedExport(file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
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
    const resizeLayer = resizeLayerRef.current
    const handlesWereVisible = resizeLayer?.visible() ?? false
    resizeLayer?.hide()
    let canvas: HTMLCanvasElement
    try {
      canvas = stageRef.current.toCanvas({ pixelRatio })
    } finally {
      resizeLayer?.visible(handlesWereVisible)
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
              {/* 名称输入会立即反映在画布上。 */}
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

      <section className="preview" aria-label="Picture preview">
        <div className="preview-viewport" ref={previewRef}>
          {isComposing && <output className="preview-zoom" aria-label="Zoom level">{view.zoom.toFixed(2)}×</output>}
        { image && canvasWidth > 0 ? (
          <div className="canvas-shell" style={{ width: canvasWidth, height: canvasHeight }}>
          <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}>
            <Layer>
              {/* 图层顺序：原图 → 固定取景框 → 可拖动追踪框与名称。 */}
              <KonvaImage
                image={image}
                width={canvasWidth}
                height={canvasHeight}
                crop={getPhotoCrop(view, image.naturalWidth, image.naturalHeight)}
                listening={false}
              />
              <Group opacity={0.45} listening={false}>
                <Line points={[inset + arm, inset, inset, inset, inset, inset + arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
                <Line points={[canvasWidth - inset - arm, inset, canvasWidth - inset, inset, canvasWidth - inset, inset + arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
                <Line points={[inset + arm, canvasHeight - inset, inset, canvasHeight - inset, inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
                <Line points={[canvasWidth - inset - arm, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
              </Group>
              {/* 指示点与页面按钮、键盘和标尺拖动共用同一倍率。 */}
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
                    inset - 12 * overlayScale, zoomMarkerY - 5 * overlayScale,
                    inset - 5 * overlayScale, zoomMarkerY,
                    inset - 12 * overlayScale, zoomMarkerY + 5 * overlayScale,
                  ]}
                  closed
                  fill={colors.sheikah}
                />
                <Text
                  x={inset - 26 * overlayScale}
                  y={zoomTop + zoomHeight + 12 * overlayScale}
                  width={52 * overlayScale}
                  text={`${view.zoom.toFixed(1)}×`}
                  align="center"
                  fontSize={12 * overlayScale}
                  fill={colors.sheikah}
                />
              </Group>
              {/* Group 内的元素一起拖动；名称在贴近顶部时切到下边缘。 */}
              <Group
                listening={trackingEditing && !isComposing}
                x={targetX}
                y={targetY}
                draggable={trackingEditing && !isComposing}
                dragBoundFunc={boundDrag}
                onMouseEnter={(event) => {
                  const container = event.target.getStage()?.container()
                  if (container && trackingEditing) container.style.cursor = 'grab'
                }}
                onMouseLeave={(event) => {
                  const container = event.target.getStage()?.container()
                  if (container && !event.currentTarget.isDragging()) container.style.cursor = ''
                }}
                onDragStart={(event) => {
                  const container = event.target.getStage()?.container()
                  if (container) container.style.cursor = 'grabbing'
                }}
                onDragMove={handleTargetMove}
                onDragEnd={(event) => {
                  handleTargetMove(event)
                  const stage = event.target.getStage()
                  const point = stage?.getPointerPosition()
                  if (stage) {
                    const inside = point && Math.abs(point.x - event.target.x()) <= boxWidth / 2
                      && Math.abs(point.y - event.target.y()) <= boxHeight / 2
                    stage.container().style.cursor = inside ? 'grab' : ''
                  }
                }}
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
            <Layer ref={resizeLayerRef} visible={trackingEditing && !isComposing}>
              {/* 透明命中区覆盖四个角；可拖拽区域比细线更适合触屏操作。 */}
              {([
                { x: -1, y: -1 }, { x: 1, y: -1 },
                { x: -1, y: 1 }, { x: 1, y: 1 },
              ] as const).map((corner) => (
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
                    startResize(corner)
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true
                    handleResizeMove(event)
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true
                    endResize(event)
                  }}
                />
              ))}
            </Layer>
          </Stage>
          {isComposing && (
            <>
              <PhotoGestures view={view} onChange={composition.changeView} onZoomBy={composition.zoomBy} />
              {/* 透明的原生滑块覆盖标尺，保留键盘与触屏支持；端点补偿拇指高度。 */}
              <input
                className="zoom-input"
                type="range"
                aria-label="Picture zoom"
                aria-valuetext={`${view.zoom.toFixed(2)} times`}
                min={MIN_PHOTO_ZOOM}
                max={MAX_PHOTO_ZOOM}
                step="0.01"
                value={view.zoom}
                style={{ left: inset - 18, top: zoomTop - 12, height: zoomHeight + 24 }}
                onChange={(event) => composition.changeZoom(Number(event.target.value))}
              />
            </>
          )}
          </div>
        ): (
          <p>After uploaded, preview the image here.</p>
        )}
          {image && isComposing && (
              <CameraControls key="picture" view={view} onAction={composition.act} onConfirm={composition.confirm} onCancel={cancelPicture} />
          )}
          {image && !isComposing && trackingEditing && (
            <CameraControls key="tracking" onAction={adjustTracking} onConfirm={confirmTracking} onCancel={exitTracking} />
          )}
          {image && (
            <DialogChoice
              className="preview-mode-choice"
              options={PREVIEW_MODES}
              selectedIndex={isComposing ? 1 : trackingEditing ? 0 : -1}
              onSelect={(mode) => {
                if (mode === 'picture') {
                  if (isComposing) return
                  if (trackingEditing) beginTracking()
                  composition.begin()
                } else if (isComposing || !trackingEditing) {
                  beginTracking()
                  if (isComposing) composition.confirm()
                }
              }}
            />
          )}
        </div>
      </section>
    </main>
  )
}

export default App
