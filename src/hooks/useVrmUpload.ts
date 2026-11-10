import { useCallback } from 'react'
import { useVrmStore } from 'src/stores/vrmStore'
import { isVrmModel, MAX_VRM_UPLOAD_BYTES } from 'src/utils/vrmModels'

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json()
    if (
      body &&
      typeof body === 'object' &&
      typeof (body as { error?: unknown }).error === 'string'
    ) {
      return (body as { error: string }).error
    }
  } catch {
    // JSON でない応答は下の既定メッセージを使う
  }
  if (response.status === 413) {
    return 'ファイルサイズが上限を超えています'
  }
  return 'モデルを保存できませんでした'
}

export const useVrmUpload = () => {
  const addModel = useVrmStore((state) => state.addModel)
  const setModelName = useVrmStore((state) => state.setModelName)
  const setInputVrmModel = useVrmStore((state) => state.setInputVrmModel)

  const uploadVrmFile = useCallback(
    async (file: File) => {
      // ブラウザ経路は送信前に弾き、サーバー側の 413 到達失敗で揮発インポートに落ちないようにする
      if (file.size > MAX_VRM_UPLOAD_BYTES) {
        window.alert('ファイルサイズが上限を超えています')
        return
      }

      try {
        const response = await fetch(
          `/api/models?name=${encodeURIComponent(file.name)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: file,
          },
        )

        if (response.status === 201) {
          const body: unknown = await response.json()
          if (!isVrmModel(body)) {
            // 保存はできたが応答が想定外なら、従来どおり揮発表示に落とす
            setInputVrmModel(file)
            return
          }
          // 再取得を待たず addModel してから選択し、一覧に無い id として既定へ戻されないようにする
          addModel(body)
          setModelName(body.id)
          return
        }

        if (response.status === 400 || response.status === 413) {
          window.alert(await readErrorMessage(response))
          return
        }

        if (response.status >= 500) {
          console.error('POST /api/models failed', response.status)
        }
        // 403 / 404 / 405 / 5xx / JSON でない応答などは静的配信相当として揮発インポート
        setInputVrmModel(file)
      } catch (error) {
        console.error('POST /api/models network error', error)
        setInputVrmModel(file)
      }
    },
    [addModel, setInputVrmModel, setModelName],
  )

  return { uploadVrmFile }
}
