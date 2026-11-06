// x、y 是相对画幅的平移量；zoom 为 1 时显示完整原图。
export interface PhotoView {
  zoom: number
  x: number
  y: number
}

export type CameraAction = 'up' | 'down' | 'left' | 'right' | 'zoomIn' | 'zoomOut'

export const MIN_PHOTO_ZOOM = 1
export const MAX_PHOTO_ZOOM = 3
export const INITIAL_PHOTO_VIEW: PhotoView = { zoom: 1, x: 0, y: 0 }

export function constrainPhotoView(view: PhotoView): PhotoView {
  const zoom = Math.max(MIN_PHOTO_ZOOM, Math.min(MAX_PHOTO_ZOOM, view.zoom))
  // 放大后多出的宽高分布在两侧，平移不能让图片边缘进入画幅。
  const limit = (zoom - 1) / 2
  return {
    zoom,
    x: Math.max(-limit, Math.min(limit, view.x)),
    y: Math.max(-limit, Math.min(limit, view.y)),
  }
}

export function zoomPhotoView(view: PhotoView, nextZoom: number): PhotoView {
  const zoom = Math.max(MIN_PHOTO_ZOOM, Math.min(MAX_PHOTO_ZOOM, nextZoom))
  const ratio = zoom / view.zoom
  // 同时缩放平移量，让画面中心对应的原图位置保持不变。
  return constrainPhotoView({ zoom, x: view.x * ratio, y: view.y * ratio })
}

export function applyCameraAction(view: PhotoView, action: CameraAction): PhotoView {
  if (action === 'zoomIn' || action === 'zoomOut') {
    return zoomPhotoView(view, view.zoom + (action === 'zoomIn' ? 0.05 : -0.05))
  }
  const step = 0.01 // 每次平移画幅的 1%，不受预览窗口大小影响。
  // 方向键移动取景视角，照片的位移方向与视角相反。
  return constrainPhotoView({
    ...view,
    x: view.x + (action === 'left' ? step : action === 'right' ? -step : 0),
    y: view.y + (action === 'up' ? step : action === 'down' ? -step : 0),
  })
}

export function getPhotoCrop(view: PhotoView, width: number, height: number) {
  // 直接从原图取样；预览和导出使用同一裁切区域，不生成中间图片。
  return {
    x: width * (0.5 - (0.5 + view.x) / view.zoom),
    y: height * (0.5 - (0.5 + view.y) / view.zoom),
    width: width / view.zoom,
    height: height / view.zoom,
  }
}
