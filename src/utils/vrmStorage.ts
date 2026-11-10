import { createWriteStream, promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import type { Readable } from 'stream'
import {
  BUILTIN_VRM_MODELS,
  buildUserModelUrl,
  getModelIdFromFile,
  getModelLabel,
  isVrmExtension,
  MAX_VRM_UPLOAD_BYTES,
  VrmModel,
} from 'src/utils/vrmModels'

export const VRM_DIR = path.join(process.cwd(), 'data', 'vrm')
export { MAX_VRM_UPLOAD_BYTES }

let uploadMutex: Promise<void> = Promise.resolve()

export const withUploadMutex = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void = () => undefined
  const previous = uploadMutex
  uploadMutex = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

export const ensureVrmDir = async (): Promise<void> => {
  await fs.mkdir(VRM_DIR, { recursive: true })
}

const isDotFile = (fileName: string): boolean => fileName.startsWith('.')

const normalizeIdKey = (id: string): string => id.toLowerCase()

export const listUserVrmFiles = async (): Promise<string[]> => {
  try {
    const entries = await fs.readdir(VRM_DIR)
    return entries
      .filter((name) => !isDotFile(name) && isVrmExtension(name))
      .sort((a, b) => a.localeCompare(b))
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export const listVrmModels = async (): Promise<VrmModel[]> => {
  const reservedIds = new Set(
    BUILTIN_VRM_MODELS.map((model) => normalizeIdKey(model.id)),
  )
  const seenIds = new Set(reservedIds)
  const userModels: VrmModel[] = []

  for (const fileName of await listUserVrmFiles()) {
    const id = getModelIdFromFile(fileName)
    const idKey = normalizeIdKey(id)
    if (seenIds.has(idKey)) {
      continue
    }
    seenIds.add(idKey)
    userModels.push({
      id,
      file: fileName,
      label: getModelLabel(id),
      url: buildUserModelUrl(fileName),
      builtin: false,
    })
  }

  return [...BUILTIN_VRM_MODELS, ...userModels]
}

export const collectExistingIdKeys = async (): Promise<Set<string>> => {
  const ids = new Set(
    BUILTIN_VRM_MODELS.map((model) => normalizeIdKey(model.id)),
  )
  for (const fileName of await listUserVrmFiles()) {
    ids.add(normalizeIdKey(getModelIdFromFile(fileName)))
  }
  return ids
}

const stripControlAndSeparators = (value: string): string => {
  let result = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f || char === '/' || char === '\\') {
      continue
    }
    result += char
  }
  return result
}

export const sanitizeUploadFileName = (
  rawName: string,
): { ok: true; fileName: string; id: string } | { ok: false; message: string } => {
  const baseName = stripControlAndSeparators(path.basename(rawName))
  if (!baseName || isDotFile(baseName)) {
    return { ok: false, message: '不正なファイル名です' }
  }
  if (!isVrmExtension(baseName)) {
    return { ok: false, message: '拡張子は .vrm である必要があります' }
  }
  const id = getModelIdFromFile(baseName)
  if (!id || isDotFile(id)) {
    return { ok: false, message: '不正なファイル名です' }
  }
  return { ok: true, fileName: `${id}.vrm`, id }
}

const buildCandidateFileName = (id: string, attempt: number): string => {
  if (attempt === 1) {
    return `${id}.vrm`
  }
  return `${id}-${attempt}.vrm`
}

export const allocateUniqueFileName = async (
  baseId: string,
): Promise<{ fileName: string; id: string }> => {
  const existingIds = await collectExistingIdKeys()
  for (let attempt = 1; attempt < Number.MAX_SAFE_INTEGER; attempt += 1) {
    const candidateId = attempt === 1 ? baseId : `${baseId}-${attempt}`
    const candidateKey = normalizeIdKey(candidateId)
    if (!existingIds.has(candidateKey)) {
      return {
        fileName: buildCandidateFileName(baseId, attempt),
        id: candidateId,
      }
    }
  }
  throw new Error('failed to allocate unique VRM file name')
}

export const createTempUploadPath = async (): Promise<string> => {
  await ensureVrmDir()
  const random = randomBytes(16).toString('hex')
  return path.join(VRM_DIR, `.upload-${random}.tmp`)
}

export const removeFileIfExists = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') {
      throw error
    }
  }
}

export type WriteUploadResult = 'ok' | 'too_large'

export const writeRequestBodyToFile = async (
  body: Readable,
  destPath: string,
  maxBytes: number,
): Promise<WriteUploadResult> => {
  // 上限超過で Transform を error にすると pipeline が req を destroy し、
  // Node 16 ではソケットごと切れて 413 を返せない。超過後は chunk を捨てて読み切る。
  let received = 0
  let tooLarge = false
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      if (tooLarge) {
        callback()
        return
      }
      received += chunk.length
      if (received > maxBytes) {
        tooLarge = true
        callback()
        return
      }
      callback(null, chunk)
    },
  })
  await pipeline(body, limiter, createWriteStream(destPath))
  return tooLarge ? 'too_large' : 'ok'
}

export const validateVrmFile = async (filePath: string): Promise<boolean> => {
  const fileHandle = await fs.open(filePath, 'r')
  try {
    const header = Buffer.alloc(12)
    const headerRead = await fileHandle.read(header, 0, 12, 0)
    if (headerRead.bytesRead < 12) {
      return false
    }
    if (header.toString('ascii', 0, 4) !== 'glTF') {
      return false
    }
    if (header.readUInt32LE(4) !== 2) {
      return false
    }

    const chunkHeader = Buffer.alloc(8)
    const chunkHeaderRead = await fileHandle.read(chunkHeader, 0, 8, 12)
    if (chunkHeaderRead.bytesRead < 8) {
      return false
    }
    const chunkLength = chunkHeader.readUInt32LE(0)
    const chunkType = chunkHeader.toString('ascii', 4, 8)
    if (chunkType !== 'JSON') {
      return false
    }
    // JSON チャンクが異常に大きい場合は VRM として扱わない
    if (chunkLength <= 0 || chunkLength > MAX_VRM_UPLOAD_BYTES) {
      return false
    }

    const jsonBuffer = Buffer.alloc(chunkLength)
    const jsonRead = await fileHandle.read(jsonBuffer, 0, chunkLength, 20)
    if (jsonRead.bytesRead < chunkLength) {
      return false
    }

    const json = JSON.parse(jsonBuffer.toString('utf8')) as {
      extensionsUsed?: unknown
    }
    if (!Array.isArray(json.extensionsUsed)) {
      return false
    }
    return (
      json.extensionsUsed.includes('VRM') ||
      json.extensionsUsed.includes('VRMC_vrm')
    )
  } catch {
    return false
  } finally {
    await fileHandle.close()
  }
}

export const linkTempToFinalName = async (
  tempPath: string,
  fileName: string,
): Promise<void> => {
  const destPath = path.join(VRM_DIR, fileName)
  await fs.link(tempPath, destPath)
}

export const resolveVrmFilePath = (
  rawFileParam: string | string[] | undefined,
): string | null => {
  if (typeof rawFileParam !== 'string' || rawFileParam.length === 0) {
    return null
  }
  // Next がデコードした値を使い、パス区切りや相対参照を弾く
  if (
    rawFileParam.includes('/') ||
    rawFileParam.includes('\\') ||
    rawFileParam.includes('\0') ||
    isDotFile(rawFileParam)
  ) {
    return null
  }

  const resolvedDir = path.resolve(VRM_DIR)
  const resolvedPath = path.resolve(resolvedDir, rawFileParam)
  const relative = path.relative(resolvedDir, resolvedPath)
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative.includes(`..${path.sep}`)
  ) {
    return null
  }
  if (resolvedPath === resolvedDir) {
    return null
  }
  return resolvedPath
}

export const toSavedVrmModel = (fileName: string, id: string): VrmModel => {
  return {
    id,
    file: fileName,
    label: getModelLabel(id),
    url: buildUserModelUrl(fileName),
    builtin: false,
  }
}
