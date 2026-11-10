import type { NextApiRequest, NextApiResponse } from 'next'
import { createReadStream, promises as fs } from 'fs'
import { pipeline } from 'stream/promises'
import { resolveVrmFilePath } from 'src/utils/vrmStorage'

export const config = {
  api: {
    responseLimit: false,
  },
}

const methodNotAllowed = (res: NextApiResponse) => {
  res.setHeader('Allow', 'GET')
  res.status(405).json({ error: 'Method Not Allowed' })
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const filePath = resolveVrmFilePath(req.query.file)
  if (!filePath) {
    res.status(404).json({ error: 'Not Found' })
    return
  }

  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      res.status(404).json({ error: 'Not Found' })
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    await pipeline(createReadStream(filePath), res)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Not Found' })
      return
    }
    // クライアント切断など、レスポンス開始後の失敗は握りつぶす
    if (!res.headersSent) {
      console.error('GET /api/models/[file] failed', error)
      res.status(500).json({ error: 'Failed to read model' })
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
  methodNotAllowed(res)
}
