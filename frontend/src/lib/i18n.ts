export type Lang = "zh" | "en"

export const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: "zh", label: "简体中文", short: "中" },
  { value: "en", label: "English", short: "EN" },
]

export const DEFAULT_LANG: Lang = "zh"
const STORAGE_KEY = "qwen2api_lang"

export function getStoredLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === "zh" || v === "en") return v
  } catch {
    // ignore
  }
  return DEFAULT_LANG
}

export function setStoredLang(lang: Lang) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // ignore
  }
}

export type TranslationTree = {
  [key: string]: string | TranslationTree
}

export type InterpolationParams = Record<string, string | number>

export function lookup(tree: TranslationTree, key: string): string | undefined {
  const parts = key.split(".")
  let node: string | TranslationTree | undefined = tree
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as TranslationTree)[part]
  }
  return typeof node === "string" ? node : undefined
}

export function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = params[name]
    return v === undefined || v === null ? `{${name}}` : String(v)
  })
}
