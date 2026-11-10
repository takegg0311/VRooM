import create from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import {
  BUILTIN_VRM_MODELS,
  isVrmModelListResponse,
  VrmModel,
} from 'src/utils/vrmModels'

type ModelsStatus = 'loading' | 'loaded' | 'failed'

interface VrmState {
  modelName: string
  animation: string
  inputVrmModel: File | null | undefined
  emote: string | undefined
  expression:
    | {
        name: string
        weight: number
      }
    | undefined
  models: VrmModel[]
  modelsStatus: ModelsStatus
  setAnimation: (animation: string) => void
  setExpression: (expression: { name: string; weight: number }) => void
  setModelName: (name: string) => void
  setInputVrmModel: (file: File | null | undefined) => void
  emoteStart: (emote: string) => void
  emoteFinish: () => void
  fetchModels: () => Promise<void>
  addModel: (model: VrmModel) => void
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

export const useVrmStore = create<VrmState>()(
  persist(
    // persist で包んで modelName だけ残す。devtools との順は zustand 4.1.2 で型が通るこちらを採用
    devtools((set, get) => ({
      modelName: 'AliciaSolid',
      animation: 'idle',
      inputVrmModel: undefined,
      emote: undefined,
      expression: undefined,
      models: BUILTIN_VRM_MODELS,
      modelsStatus: 'loading',
      setModelName: (name) =>
        set(
          (state) => ({
            ...state,
            modelName: name,
            inputVrmModel: undefined,
          }),
          false,
          'setModelName',
        ),
      setAnimation: (animation) =>
        set(
          (state) => ({
            ...state,
            animation,
          }),
          false,
          'setAnimation',
        ),
      setExpression: (expression) =>
        set(
          (state) => ({
            ...state,
            expression: expression,
          }),
          false,
          'setExpression',
        ),
      setInputVrmModel: (url) =>
        set(
          (state) => ({
            ...state,
            inputVrmModel: url,
          }),
          false,
          'setInputVrmModel',
        ),
      emoteStart: (emote) =>
        set(
          (state) => ({
            ...state,
            emote,
          }),
          false,
          'emoteStart',
        ),
      emoteFinish: () =>
        set(
          (state) => ({
            ...state,
            emote: undefined,
          }),
          false,
          'emoteFinish',
        ),
      fetchModels: async () => {
        try {
          const response = await fetch('/api/models')
          if (!response.ok) {
            throw new Error(`failed to fetch models: ${response.status}`)
          }
          const body: unknown = await response.json()
          if (!isVrmModelListResponse(body)) {
            throw new Error('invalid models response')
          }
          set(
            (state) => ({
              ...state,
              models: body.models,
              modelsStatus: 'loaded',
            }),
            false,
            'fetchModels/success',
          )
        } catch {
          // 静的配信では 404 HTML が返る。models は直前の値のままにし、初回だけ failed にする
          if (get().modelsStatus === 'loading') {
            set(
              (state) => ({
                ...state,
                modelsStatus: 'failed',
              }),
              false,
              'fetchModels/failed',
            )
          }
        }
      },
      addModel: (model) =>
        set(
          (state) => {
            const exists = state.models.some(
              (current) => current.id.toLowerCase() === model.id.toLowerCase(),
            )
            const models = exists
              ? state.models.map((current) =>
                  current.id.toLowerCase() === model.id.toLowerCase()
                    ? model
                    : current,
                )
              : [...state.models, model]
            return {
              ...state,
              models,
            }
          },
          false,
          'addModel',
        ),
    })),
    {
      name: 'vroom-vrm',
      partialize: (state) => ({ modelName: state.modelName }),
      // SSR 時に localStorage が無くても落ちないようにする
      getStorage: () =>
        typeof window === 'undefined' ? noopStorage : localStorage,
    },
  ),
)
