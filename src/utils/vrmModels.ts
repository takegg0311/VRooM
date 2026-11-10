export type VrmModel = {
  id: string
  file: string
  label: string
  url: string
  builtin: boolean
}

export const BUILTIN_VRM_MODELS: VrmModel[] = [
  {
    id: 'AliciaSolid',
    file: 'AliciaSolid.vrm',
    label: 'アリシア・ソリッド',
    url: '/models/AliciaSolid.vrm',
    builtin: true,
  },
  {
    id: 'Miraikomachi',
    file: 'Miraikomachi.vrm',
    label: 'ミライ小町',
    url: '/models/Miraikomachi.vrm',
    builtin: true,
  },
]

export const DEFAULT_VRM_MODEL_ID = 'AliciaSolid'

const BUILTIN_LABELS: Record<string, string> = Object.fromEntries(
  BUILTIN_VRM_MODELS.map((model) => [model.id.toLowerCase(), model.label]),
)

export const getModelIdFromFile = (fileName: string): string => {
  const baseName = fileName.replace(/\.[^.]+$/, '')
  return baseName
}

export const getModelLabel = (id: string): string => {
  return BUILTIN_LABELS[id.toLowerCase()] ?? id
}

export const isVrmExtension = (fileName: string): boolean => {
  return /\.vrm$/i.test(fileName)
}

export const buildUserModelUrl = (fileName: string): string => {
  return `/api/models/${encodeURIComponent(fileName)}`
}

export const isVrmModel = (value: unknown): value is VrmModel => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const model = value as Record<string, unknown>
  return (
    typeof model.id === 'string' &&
    typeof model.file === 'string' &&
    typeof model.label === 'string' &&
    typeof model.url === 'string' &&
    typeof model.builtin === 'boolean'
  )
}

export const isVrmModelListResponse = (
  value: unknown,
): value is { models: VrmModel[] } => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const body = value as Record<string, unknown>
  return Array.isArray(body.models) && body.models.every(isVrmModel)
}
