import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_LANG, interpolate, lookup, setStoredLang, getStoredLang, type Lang } from "./i18n"
import { translations } from "./translations"
import { I18nContext, type I18nContextValue } from "./useI18n"

function buildT(tree: typeof translations.zh) {
  return (key: string, params?: Record<string, string | number>): string => {
    const value = lookup(tree, key)
    if (typeof value !== "string") {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] missing translation for key: ${key}`)
      }
      return key
    }
    return interpolate(value, params)
  }
}

function buildExists(tree: typeof translations.zh) {
  return (key: string): boolean => typeof lookup(tree, key) === "string"
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getStoredLang())

  useEffect(() => {
    setStoredLang(lang)
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    if (next !== "zh" && next !== "en") return
    setLangState(next)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const tree = translations[lang] ?? translations[DEFAULT_LANG]
    return {
      lang,
      setLang,
      t: buildT(tree),
      exists: buildExists(tree),
    }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
