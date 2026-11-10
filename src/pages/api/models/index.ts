import type { NextApiRequest, NextApiResponse } from 'next'
import {
  allocateUniqueFileName,
  createTempUploadPath,
  ensureVrmDir,
  isSizeLimitExceededError,
  linkTempToFinalName,
  listVrmModels,
  MAX_VRM_UPLOAD_BYTES,
  removeFileIfExists,
  sanitizeUploadFileName,
  toSavedVrmModel,
  validateVrmFile,
  withUploadMutex,
  writeRequestBodyToFile,
} from 'src/utils/vrmStorage'

export const config = {
  api: {
    bodyParser: false,
  },
}

const methodNotAllowed = (res: NextApiResponse) => {
  res.setHeader('Allow', 'GET, POST')
  res.status(405).json({ error: 'Method Not Allowed' })
}

const handleGet = async (_req: NextApiRequest, res: NextApiResponse) => {
  const models = await listVrmModels()
  res.status(200).json({ models })
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'Uploads are only allowed in development' })
    return
  }

  const rawName = Array.isArray(req.query.name)
    ? req.query.name[0]
    : req.query.name
  if (typeof rawName !== 'string' || rawName.length === 0) {
    res.status(400).json({ error: 'name query parameter is required' })
    return
  }

  const sanitized = sanitizeUploadFileName(rawName)
  if (!sanitized.ok) {
    res.status(400).json({ error: sanitized.message })
    return
  }

  let tempPath: string | null = null
  try {
    await ensureVrmDir()
    tempPath = await createTempUploadPath()
    await writeRequestBodyToFile(req, tempPath, MAX_VRM_UPLOAD_BYTES)

    const isValidVrm = await validateVrmFile(tempPath)
    if (!isValidVrm) {
      res.status(400).json({ error: 'VRM ファイルとして検証できませんでした' })
      return
    }

    const savedModel = await withUploadMutex(async () => {
      // 名前決定から link までを直列化し、大文字小文字違いの同時 upload でも識別子が重ならないようにする
      for (let attempt = 1; attempt <= 100; attempt += 1) {
        const allocated = await allocateUniqueFileName(sanitized.id)
        try {
          await linkTempToFinalName(tempPath as string, allocated.fileName)
          return toSavedVrmModel(allocated.fileName, allocated.id)
        } catch (error) {
          const err = error as NodeJS.ErrnoException
          if (err.code === 'EEXIST' && attempt < 100) {
            continue
          }
          throw error
        }
      }
      throw new Error('failed to link uploaded VRM file')
    })

    res.status(201).json(savedModel)
  } catch (error) {
    if (isSizeLimitExceededError(error)) {
      res.status(413).json({ error: 'File too large' })
      return
    }
    console.error('POST /api/models failed', error)
    res.status(500).json({ error: 'Failed to save model' })
  } finally {
    if (tempPath) {
      await removeFileIfExists(tempPath)
    }
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    await handleGet(req, res)
    return
  }
  if (req.method === 'POST') {
    await handlePost(req, res)
    return
  }
  methodNotAllowed(res)
}
