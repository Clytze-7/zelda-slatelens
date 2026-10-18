// EXIF 日期不带时区；文件名只需要拍摄地记录的年月日。
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

// 优先使用 EXIF 拍摄日期；没有时用文件修改日期；无有效时间戳则用当天。
export function resolveImageDate(captureDate: string | null, lastModified: number, today = new Date()): string {
  if (captureDate) return captureDate
  if (Number.isFinite(lastModified) && lastModified > 0) {
    const modifiedAt = new Date(lastModified)
    if (!Number.isNaN(modifiedAt.getTime())) return formatLocalDate(modifiedAt)
  }
  return formatLocalDate(today)
}

function parseExifDate(value: string): string | null {
  const match = /^(\d{4}):(\d{2}):(\d{2})/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return null
  }

  return `${match[1]}${match[2]}${match[3]}`
}

// JPEG APP1、PNG eXIf 和 WebP EXIF 都可能包含同一种 TIFF 格式的 EXIF 数据。
function parseExif(buffer: ArrayBuffer, start: number, end: number): string | null {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (end - start >= 6 && bytes[start] === 0x45 && bytes[start + 1] === 0x78 &&
      bytes[start + 2] === 0x69 && bytes[start + 3] === 0x66 &&
      bytes[start + 4] === 0 && bytes[start + 5] === 0) {
    start += 6 // 跳过 "Exif\0\0"，下面的偏移量都以 TIFF 起点为基准。
  }
  const inside = (offset: number, length: number) =>
    offset >= start && length >= 0 && offset + length <= end
  if (!inside(start, 8)) return null

  const littleEndian = bytes[start] === 0x49 && bytes[start + 1] === 0x49
  if (!littleEndian && !(bytes[start] === 0x4d && bytes[start + 1] === 0x4d)) return null
  if (view.getUint16(start + 2, littleEndian) !== 42) return null

  function findTag(ifdOffset: number, tag: number): number | null {
    const ifd = start + ifdOffset
    if (!inside(ifd, 2)) return null
    const count = view.getUint16(ifd, littleEndian)
    if (!inside(ifd + 2, count * 12)) return null
    for (let index = 0; index < count; index += 1) {
      const entry = ifd + 2 + index * 12
      if (view.getUint16(entry, littleEndian) === tag) return entry
    }
    return null
  }

  const exifPointer = findTag(view.getUint32(start + 4, littleEndian), 0x8769)
  if (exifPointer === null || view.getUint16(exifPointer + 2, littleEndian) !== 4 ||
      view.getUint32(exifPointer + 4, littleEndian) !== 1) return null

  const dateEntry = findTag(view.getUint32(exifPointer + 8, littleEndian), 0x9003)
  if (dateEntry === null || view.getUint16(dateEntry + 2, littleEndian) !== 2) return null
  const length = view.getUint32(dateEntry + 4, littleEndian)
  const valueOffset = length <= 4 ? dateEntry + 8 : start + view.getUint32(dateEntry + 8, littleEndian)
  if (length < 10 || !inside(valueOffset, length)) return null

  const dateText = String.fromCharCode(...bytes.subarray(valueOffset, valueOffset + 10))
  return parseExifDate(dateText)
}

export async function readCaptureDate(file: File): Promise<string | null> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break
      while (bytes[offset] === 0xff) offset += 1
      const marker = bytes[offset]
      offset += 1
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) break
      const length = view.getUint16(offset, false)
      const end = offset + length
      if (length < 2 || end > bytes.length) break
      if (marker === 0xe1) {
        const date = parseExif(buffer, offset + 2, end)
        if (date) return date
      }
      offset = end
    }
    return null
  }

  const isPng = bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  if (isPng) {
    let offset = 8
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset, false)
      const end = offset + 8 + length
      if (end + 4 > bytes.length) break
      if (bytes[offset + 4] === 0x65 && bytes[offset + 5] === 0x58 &&
          bytes[offset + 6] === 0x49 && bytes[offset + 7] === 0x66) {
        return parseExif(buffer, offset + 8, end)
      }
      offset = end + 4 // 跳过数据后的 CRC。
    }
    return null
  }

  const isWebp = bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  if (isWebp) {
    let offset = 12
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset + 4, true)
      const end = offset + 8 + length
      if (end > bytes.length) break
      if (String.fromCharCode(...bytes.subarray(offset, offset + 4)) === 'EXIF') {
        return parseExif(buffer, offset + 8, end)
      }
      offset = end + (length % 2) // RIFF 块补齐到偶数字节。
    }
  }
  return null
}
