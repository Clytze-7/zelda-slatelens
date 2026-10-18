import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button, DirectionalArrow, Pagination, SettingsToggle, SheikahTextTitle } from 'zelda-hyrule-ui'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import './App.css'
import { colors } from './theme'

const SETTINGS_PAGES = ['Basic']

function App() {
  // 图片只保存在浏览器内存中；两个 ref 分别指向预览容器和隐藏的文件输入框。
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })

  const [recorded, setRecorded] = useState(false)
  // 追踪框的位置以画布宽高的比例保存，窗口缩放后仍指向图片的同一区域。
  const [targetPosition, setTargetPosition] = useState({ x: 0.5, y: 0.5 })
  const [boxPercent, setBoxPercent] = useState(28)
  const [fileName, setFileName] = useState('')
  const [targetName, setTargetName] = useState('Unknown')
  const [compressedExport, setCompressedExport] = useState(false)
  const [settingsPage, setSettingsPage] = useState(0)

  const stageRef = useRef<Konva.Stage>(null)


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

  // 滑块值表示追踪框占图片短边的百分比。
  const boxSize = shortEdge * boxPercent / 100

  // 装饰尺寸随预览画布缩放，导出到原图尺寸后保持相同的视觉比例。
  // 以画布短边 600px 时的原有尺寸作为基准。
  const overlayScale = shortEdge / 600
  const lineWidth = 2 * overlayScale
  const labelBorderWidth = overlayScale

  // 提示条最小宽度随画布缩放，但不能超过画布；追踪框和提示条共用中心点。
  const labelWidth = Math.min(canvasWidth, Math.max(boxSize, 140 * overlayScale))
  const labelHeight = 26 * overlayScale
  const labelGap = 6 * overlayScale
  const labelFontSize = 14 * overlayScale
  const horizontalHalf = Math.max(boxSize, labelWidth) / 2

  // 将比例坐标换算成画布像素，并限制在可见区域内。
  // 横向按较宽的元素计算；纵向额外给追踪框上方的提示条留空间。
  const targetX = Math.max(
    horizontalHalf,
    Math.min(canvasWidth - horizontalHalf, targetPosition.x * canvasWidth),
  )
  const targetY = Math.max(
    boxSize / 2 + labelHeight + labelGap,
    Math.min(canvasHeight - boxSize /2, targetPosition.y * canvasHeight),
  )
  // 外侧固定框始终为希卡蓝，只有追踪框和提示条随记录状态变色。
  const trackingColor = recorded ? colors.sheikah : colors.orange

  // 在本地读取文件，等图片解码完成后再交给 Konva 绘制。
  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        setImage(img)
        setFileName(file.name)
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
    const canvas = stageRef.current.toCanvas({ pixelRatio })
    const mimeType = compressedExport ? 'image/jpeg' : 'image/png'
    const extension = compressedExport ? 'jpg' : 'png'

    canvas.toBlob((blob) => {
      if (!blob) {
        window.alert('Exported failed')
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const exportName = (targetName.trim() || 'Unknown').replace(/[\\/:*?"<>|]/g, '_')
      const today = new Date()
      const date = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      link.href = url
      link.download = `${exportName}-${date}.${extension}`
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
                  <strong>{boxPercent}%</strong>
                </label>
                <input
                  id="box-size"
                  type="range"
                  min="12"
                  max="60"
                  value={boxPercent}
                  disabled={!image}
                  onChange={(event) => setBoxPercent(Number(event.target.value))}
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
        </div>
      </section>

      <section className="preview" ref={previewRef}>
        { image && canvasWidth > 0 ? (
          <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}>
            <Layer>
              {/* 图层顺序：原图 → 固定取景框 → 可拖动追踪框与名称提示。 */}
              <KonvaImage image={image} width={canvasWidth} height={canvasHeight} />
              <Line points={[inset + arm, inset, inset, inset, inset, inset + arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
              <Line points={[canvasWidth - inset - arm, inset, canvasWidth - inset, inset, canvasWidth - inset, inset + arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
              <Line points={[inset + arm, canvasHeight - inset, inset, canvasHeight - inset, inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
              <Line points={[canvasWidth - inset - arm, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={lineWidth} />
              {/* Group 内的元素一起拖动；边界同时考虑追踪框和上方提示条。 */}
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
                    boxSize / 2 + labelHeight + labelGap,
                    Math.min(canvasHeight - boxSize / 2, point.y),
                  ),
                })}
                onDragEnd={(event) => {
                  // 拖动结束时重新保存为 0～1 的相对坐标。
                  setTargetPosition({
                    x: event.target.x() / canvasWidth,
                    y: event.target.y() / canvasHeight
                  })
                }}
              >
                {/* 提示条与追踪框使用同一状态颜色。 */}
                <Rect
                  x={-labelWidth / 2}
                  y={-boxSize / 2 - labelHeight - labelGap}
                  width={labelWidth}
                  height={labelHeight}
                  fill="rgba(10, 20, 40, 0.75)"
                  stroke={trackingColor}
                  strokeWidth={labelBorderWidth}
                />
                <Text
                  x={-labelWidth / 2}
                  y={-boxSize / 2 - labelHeight - labelGap}
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
                <Rect
                  x={-boxSize / 2}
                  y={-boxSize / 2}
                  width={boxSize}
                  height={boxSize}
                  stroke={trackingColor}
                  strokeWidth={lineWidth}
                  fill="rgba(0, 0, 0, 0.08)"
                />
              </Group>
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
