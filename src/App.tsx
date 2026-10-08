import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button, SheikahTextTitle } from 'zelda-hyrule-ui'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Text } from 'react-konva'
import './App.css'
import { colors } from './theme'

function App() {
  // 图片只保存在浏览器内存中；两个 ref 分别指向预览容器和隐藏的文件输入框。
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewWidth, setPreviewWidth] = useState(0)

  const [recorded, setRecorded] = useState(false)
  // 追踪框的位置以画布宽高的比例保存，窗口缩放后仍指向图片的同一区域。
  const [targetPosition, setTargetPosition] = useState({ x: 0.5, y: 0.5 })
  const [boxPercent, setBoxPercent] = useState(28)
  const [fileName, setFileName] = useState('')
  const [targetName, setTargetName] = useState('Unknown')


  // 容器宽度变化时更新画布；取整可避免小数像素触发反复重绘。
  useEffect(() => {
    const element = previewRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width)
      setPreviewWidth((previous) => previous === width ? previous : width)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // 画布宽度跟随容器，高度按原图宽高比计算，避免图片被拉伸。
  const canvasWidth = image ? previewWidth : 0
  const canvasHeight = image
    ? canvasWidth * image.naturalHeight / image.naturalWidth
    : 0
  // 按短边计算装饰尺寸，让横图和竖图的取景框视觉比例接近。
  const shortEdge = Math.min(canvasWidth, canvasHeight)
  const inset = shortEdge * 0.06 // 固定框距图片边缘的距离
  const arm = shortEdge * 0.08 // 固定框每个角的线长

  // 滑块值表示追踪框占图片短边的百分比。
  const boxSize = shortEdge * boxPercent / 100

  // 提示条至少 140px 宽，但不能超过画布；追踪框和提示条共用中心点。
  const labelWidth = Math.min(canvasWidth, Math.max(boxSize, 140))
  const labelHeight = 26
  const labelGap = 6
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

  return (
    <main className="editor">
      <section className="controls">
        <SheikahTextTitle title="SlateLens" description="Add Sheikah-style camera frame for the picture"  />

        {/* 记录状态决定追踪框与识别提示的颜色。 */}
        <div className="status-buttons" role="group" aria-label="图鉴状态">
          <Button
            variant={recorded ? 'ghost' : 'primary'}
            className={!recorded ? 'status-unrecorded-active' : undefined}
            aria-pressed={!recorded}
            onClick={() => setRecorded(false)}
          >Unrecorded</Button>
          <Button
            variant={recorded ? 'sheikah' : 'ghost'}
            className={recorded ? 'status-recorded-active' : undefined}
            aria-pressed={recorded}
            onClick={() => setRecorded(true)}
          >Recorded</Button>
        </div>
        {/* UI 库按钮触发隐藏的原生文件输入框。 */}
        <div className="upload-control">
          <span className="control-label">Choose a picture</span>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            hidden
          />

          <Button
            variant="sheikah"
            block
            onClick={() => fileInputRef.current?.click()}
          >
            {image ? 'Change picture': 'Select picture'}
          </Button>

          <small className="file-name">
            {fileName || 'Your picture stays in this browser'}
          </small>
        </div>
        {/* 名称输入和大小滑块会立即反映在画布上。 */}
        <div className="name-control">
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
        <div className="size-control">
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
      </section>

      <section className="preview" ref={previewRef}>
        { image && canvasWidth > 0 ? (
          <Stage width={canvasWidth} height={canvasHeight}>
            <Layer>
              {/* 图层顺序：原图 → 固定取景框 → 可拖动追踪框与名称提示。 */}
              <KonvaImage image={image} width={canvasWidth} height={canvasHeight} />
              <Line points={[inset + arm, inset, inset, inset, inset, inset + arm]} stroke={colors.sheikah} strokeWidth={2} />
              <Line points={[canvasWidth - inset - arm, inset, canvasWidth - inset, inset, canvasWidth - inset, inset + arm]} stroke={colors.sheikah} strokeWidth={2} />
              <Line points={[inset + arm, canvasHeight - inset, inset, canvasHeight - inset, inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={2} />
              <Line points={[canvasWidth - inset - arm, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset, canvasWidth - inset, canvasHeight - inset - arm]} stroke={colors.sheikah} strokeWidth={2} />
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
                  strokeWidth={1}
                />
                <Text
                  x={-labelWidth / 2}
                  y={-boxSize / 2 - labelHeight - labelGap}
                  width={labelWidth}
                  height={labelHeight}
                  text={targetName.trim() || 'Unknown'}
                  align="center"
                  verticalAlign="middle"
                  fontSize={14}
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
                  strokeWidth={2}
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
