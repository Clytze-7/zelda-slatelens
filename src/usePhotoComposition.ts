import { useCallback, useState } from 'react'
import {
  INITIAL_PHOTO_VIEW, applyCameraAction, constrainPhotoView, zoomPhotoView,
  type CameraAction, type PhotoView,
} from './photoComposition'

export function usePhotoComposition() {
  const [session, setSession] = useState<{ view: PhotoView; saved: PhotoView | null }>({
    view: INITIAL_PHOTO_VIEW, saved: null,
  })

  const begin = useCallback(() => {
    setSession((previous) => previous.saved ? previous : { ...previous, saved: previous.view })
  }, [])
  const confirm = useCallback(() => {
    setSession((previous) => ({ ...previous, saved: null }))
  }, [])
  const cancel = useCallback(() => {
    setSession((previous) => previous.saved ? { view: previous.saved, saved: null } : previous)
  }, [])
  const reset = useCallback(() => {
    setSession({ view: INITIAL_PHOTO_VIEW, saved: null })
  }, [])
  const changeView = useCallback((view: PhotoView) => {
    setSession((previous) => previous.saved ? { ...previous, view: constrainPhotoView(view) } : previous)
  }, [])
  const changeZoom = useCallback((zoom: number) => {
    setSession((previous) => previous.saved ? { ...previous, view: zoomPhotoView(previous.view, zoom) } : previous)
  }, [])
  const zoomBy = useCallback((delta: number) => {
    setSession((previous) => previous.saved
      ? { ...previous, view: zoomPhotoView(previous.view, previous.view.zoom + delta) }
      : previous)
  }, [])
  const act = useCallback((action: CameraAction) => {
    setSession((previous) => previous.saved
      ? { ...previous, view: applyCameraAction(previous.view, action) }
      : previous)
  }, [])

  return { view: session.view, isComposing: session.saved !== null, begin, confirm, cancel, reset, changeView, changeZoom, zoomBy, act }
}
