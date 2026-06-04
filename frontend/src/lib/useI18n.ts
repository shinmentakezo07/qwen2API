import { createContext, useContext } from "react"
import type { InterpolationParams, Lang } from "./i18n"

export type I18nContextValue = {
  lang: Lang
  setLang: (next: Lang) => void
  t: (key: string, params?: InterpolationParams) => string
  exists: (key: string) => boolean
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error("useI18n must be used inside <I18nProvider>")
  }
  return ctx
}
