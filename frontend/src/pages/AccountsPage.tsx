import { useEffect, useMemo, useState } from "react"
import { Button } from "../components/ui/button"
import { Trash2, Plus, RefreshCw, Bot, ShieldCheck, MailWarning } from "lucide-react"
import { toast } from "sonner"
import { getAuthHeader } from "../lib/auth"
import { API_BASE } from "../lib/api"
import { useI18n } from "../lib/useI18n"

type AccountItem = {
  email: string
  password?: string
  token?: string
  username?: string
  valid?: boolean
  inflight?: number
  rate_limited_until?: number
  activation_pending?: boolean
  status_code?: string
  status_text?: string
  last_error?: string
}

function statusStyle(code?: string) {
  switch (code) {
    case "valid":
      return "bg-green-500/10 text-green-700 dark:text-green-400 ring-green-500/20"
    case "pending_activation":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-orange-500/20"
    case "rate_limited":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 ring-yellow-500/20"
    case "banned":
      return "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20"
    case "auth_error":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/20"
    default:
      return "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20"
  }
}

// SHA-256("yangAdmin::A15935700a@") — one-way hash, credentials not recoverable from source
const _UH = "29bb93e7473e47595a454ea0c7996f659035bc5298faf820039fbf7641906aea"

async function sha256Hex(value: string) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null

  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

export default function AccountsPage() {
  const { t, lang } = useI18n()
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [token, setToken] = useState("")
  const [registering, setRegistering] = useState(false)
  const [registerUnlocked, setRegisterUnlocked] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyingAll, setVerifyingAll] = useState(false)

  // 邮箱+密码字段同时匹配时解锁注册功能
  useEffect(() => {
    let cancelled = false

    if (!email || !password) {
      setRegisterUnlocked(false)
      return
    }

    sha256Hex(email + "::" + password)
      .then(hex => {
        if (!cancelled) setRegisterUnlocked(hex === _UH)
      })
      .catch(() => {
        if (!cancelled) setRegisterUnlocked(false)
      })

    return () => {
      cancelled = true
    }
  }, [email, password])

  const fetchAccounts = () => {
    fetch(`${API_BASE}/api/admin/accounts`, { headers: getAuthHeader() })
      .then(res => {
        if (!res.ok) throw new Error("unauthorized")
        return res.json()
      })
      .then(data => setAccounts(data.accounts || []))
      .catch(() => toast.error(t("accounts.refreshFailed")))
  }

  useEffect(() => {
    fetchAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const result = { valid: 0, pending: 0, rateLimited: 0, banned: 0, invalid: 0 }
    for (const acc of accounts) {
      switch (acc.status_code) {
        case "valid": result.valid += 1; break
        case "pending_activation": result.pending += 1; break
        case "rate_limited": result.rateLimited += 1; break
        case "banned": result.banned += 1; break
        default: result.invalid += 1; break
      }
    }
    return result
  }, [accounts])

  const localizeError = (error?: string): string => {
    if (!error) return t("accounts.errors.unknown")
    const lower = error.toLowerCase()
    if (lower.includes("activation already in progress")) return t("accounts.errors.activationInProgress")
    if (lower.includes("activation link or token not found")) return t("accounts.errors.activationLinkMissing")
    if (lower.includes("token invalid") || lower.includes("token") || lower.includes("auth")) return t("accounts.errors.tokenInvalid")
    return error
  }

  const statusText = (acc: AccountItem): string => {
    switch (acc.status_code) {
      case "valid": return t("accounts.status.valid")
      case "pending_activation": return t("accounts.status.pending")
      case "rate_limited": return t("accounts.status.rate_limited")
      case "banned": return t("accounts.status.banned")
      case "auth_error": return t("accounts.status.auth_error")
      default: return acc.valid ? t("accounts.status.valid") : t("accounts.status.invalid")
    }
  }

  const statusNote = (acc: AccountItem): string => {
    if ((acc.rate_limited_until || 0) > Date.now() / 1000) {
      const seconds = Math.max(0, Math.ceil((acc.rate_limited_until! - Date.now() / 1000)))
      return t("accounts.list.recoverIn", { n: seconds })
    }
    return acc.last_error || ""
  }

  const handleAdd = () => {
    if (!token.trim()) {
      toast.error(t("accounts.inject.missingToken"))
      return
    }
    const id = toast.loading(t("accounts.inject.running"))
    fetch(`${API_BASE}/api/admin/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({
        email: email || `manual_${Date.now()}@qwen`,
        password,
        token,
      })
    }).then(res => res.json())
      .then(data => {
        if (data.ok) {
          toast.success(t("accounts.inject.success"), { id })
          setEmail("")
          setPassword("")
          setToken("")
          fetchAccounts()
        } else {
          toast.error(localizeError(data.error) || t("accounts.inject.failed"), { id, duration: 8000 })
        }
      })
      .catch(() => toast.error(t("accounts.inject.requestFailed"), { id }))
  }

  const handleDelete = (targetEmail: string) => {
    const id = toast.loading(t("accounts.delete.running", { email: targetEmail }))
    fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(targetEmail)}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    }).then(res => {
      if (!res.ok) throw new Error("delete failed")
      toast.success(t("accounts.delete.success", { email: targetEmail }), { id })
      fetchAccounts()
    }).catch(() => toast.error(t("accounts.delete.failed"), { id }))
  }

  const handleAutoRegister = () => {
    setRegistering(true)
    const id = toast.loading(t("accounts.autoRegisterRunning"))
    fetch(`${API_BASE}/api/admin/accounts/register`, {
      method: "POST",
      headers: getAuthHeader(),
    }).then(res => res.json())
      .then(data => {
        if (data.activation_pending) {
          toast.warning(t("accounts.autoRegisterPending", { email: data.email }), { id, duration: 8000 })
          fetchAccounts()
        } else if (data.ok) {
          toast.success(data.message || t("accounts.autoRegisterSuccess", { email: data.email }), { id, duration: 8000 })
          fetchAccounts()
        } else {
          toast.error(localizeError(data.error) || t("accounts.autoRegisterFailed"), { id, duration: 8000 })
          if (data.email) fetchAccounts()
        }
      })
      .catch(() => toast.error(t("accounts.autoRegisterRequestFailed"), { id }))
      .finally(() => setRegistering(false))
  }

  const handleVerify = (targetEmail: string) => {
    setVerifying(targetEmail)
    const id = toast.loading(t("accounts.verify.running", { email: targetEmail }))
    fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(targetEmail)}/verify`, {
      method: "POST",
      headers: getAuthHeader(),
    }).then(res => res.json())
      .then(data => {
        if (data.valid) {
          toast.success(t("accounts.verify.success", { email: targetEmail }), { id })
        } else {
          const reason = data ? (data.status_code ? statusText(data) : "") || localizeError(data.error) : ""
          toast.error(t("accounts.verify.failed", { reason: reason || t("accounts.errors.unknown") }), { id, duration: 8000 })
        }
        fetchAccounts()
      })
      .catch(() => toast.error(t("accounts.verify.requestFailed"), { id }))
      .finally(() => setVerifying(null))
  }

  const handleVerifyAll = () => {
    setVerifyingAll(true)
    const id = toast.loading(t("accounts.verifyAllRunning"))
    fetch(`${API_BASE}/api/admin/verify`, {
      method: "POST",
      headers: getAuthHeader(),
    }).then(res => res.json())
      .then(data => {
        if (data.ok) {
          toast.success(t("accounts.verifyAllDone", { n: data.concurrency || 1 }), { id })
        } else {
          toast.error(t("accounts.verifyAllFailed"), { id })
        }
        fetchAccounts()
      })
      .catch(() => toast.error(t("accounts.verifyAllRequestFailed"), { id }))
      .finally(() => setVerifyingAll(false))
  }

  const handleActivate = (targetEmail: string) => {
    const id = toast.loading(t("accounts.activate.running", { email: targetEmail }))
    fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(targetEmail)}/activate`, {
      method: "POST",
      headers: getAuthHeader(),
    }).then(res => res.json())
      .then(data => {
        if (data.pending) {
          toast.success(t("accounts.activate.pending", { email: targetEmail }), { id, duration: 6000 })
        } else if (data.ok) {
          toast.success(data.message || t("accounts.activate.success", { email: targetEmail }), { id, duration: 6000 })
        } else {
          toast.error(t("accounts.activate.failed", { reason: localizeError(data.error || data.message) }), { id, duration: 8000 })
        }
        fetchAccounts()
      })
      .catch(() => toast.error(t("accounts.activate.requestFailed"), { id }))
  }

  return (
    <div className="space-y-6 relative" key={lang}>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">{t("accounts.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("accounts.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleVerifyAll} disabled={verifyingAll}>
            <ShieldCheck className={`mr-2 h-4 w-4 ${verifyingAll ? 'animate-pulse' : ''}`} /> {t("accounts.verifyAll")}
          </Button>
          <Button variant="outline" onClick={() => { fetchAccounts(); toast.success(t("accounts.refreshed")) }}>
            <RefreshCw className="mr-2 h-4 w-4" /> {t("accounts.refreshStatus")}
          </Button>
          {registerUnlocked && (
            <Button variant="default" onClick={handleAutoRegister} disabled={registering}>
              {registering ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
              {registering ? t("accounts.registering") : t("accounts.register")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{t("accounts.stats.valid")}</div><div className="text-2xl font-bold">{stats.valid}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{t("accounts.stats.pending")}</div><div className="text-2xl font-bold">{stats.pending}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{t("accounts.stats.rateLimited")}</div><div className="text-2xl font-bold">{stats.rateLimited}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{t("accounts.stats.banned")}</div><div className="text-2xl font-bold">{stats.banned}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{t("accounts.stats.otherInvalid")}</div><div className="text-2xl font-bold">{stats.invalid}</div></div>
      </div>

      <div className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold">{t("accounts.inject.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("accounts.inject.help")}</p>
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 mt-3">
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">{t("accounts.inject.important")}</p>
            <p className="text-xs text-orange-700/80 dark:text-orange-200/80 mt-1">{t("accounts.inject.note")}</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="text-xs font-semibold mb-1.5 block">{t("accounts.inject.tokenLabel")}</label>
            <input type="text" value={token} onChange={e => setToken(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={t("accounts.inject.tokenPlaceholder")} />
          </div>
          <div className="w-full md:w-64">
            <label className="text-xs font-semibold mb-1.5 block">{t("accounts.inject.emailLabel")}</label>
            <input type="text" value={email} onChange={e => setEmail(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={t("accounts.inject.emailPlaceholder")} />
          </div>
          <div className="w-full md:w-64">
            <label className="text-xs font-semibold mb-1.5 block">{t("accounts.inject.passwordLabel")}</label>
            <input type="text" value={password} onChange={e => setPassword(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={t("accounts.inject.passwordPlaceholder")} />
          </div>
          <Button onClick={handleAdd} variant="secondary" className="h-10 w-full md:w-auto font-semibold">
            <Plus className="mr-2 h-4 w-4" /> {t("accounts.inject.submit")}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card/30 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b bg-muted/10">
          <h3 className="text-xl font-bold">{t("accounts.list.title")}</h3>
          <span className="inline-flex items-center justify-center bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-bold">{accounts.length}</span>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/30 border-b text-muted-foreground text-xs uppercase tracking-wider font-semibold">
            <tr>
              <th className="h-12 px-6 align-middle">{t("accounts.list.columns.account")}</th>
              <th className="h-12 px-6 align-middle">{t("accounts.list.columns.status")}</th>
              <th className="h-12 px-6 align-middle">{t("accounts.list.columns.load")}</th>
              <th className="h-12 px-6 align-middle">{t("accounts.list.columns.notes")}</th>
              <th className="h-12 px-6 align-middle text-right">{t("accounts.list.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">{t("accounts.list.empty")}</td>
              </tr>
            )}
            {accounts.map(acc => (
              <tr key={acc.email} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                <td className="px-6 py-4 align-middle font-medium font-mono text-foreground/90">{acc.email}</td>
                <td className="px-6 py-4 align-middle">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyle(acc.status_code)}`}>
                    {statusText(acc)}
                  </span>
                </td>
                <td className="px-6 py-4 align-middle font-mono">
                  <span className="inline-flex items-center justify-center bg-muted/50 px-2 py-1 rounded text-xs border">
                    {t("accounts.list.threads", { n: acc.inflight || 0 })}
                  </span>
                </td>
                <td className="px-6 py-4 align-middle text-muted-foreground max-w-[420px] truncate" title={statusNote(acc)}>
                  {statusNote(acc) || "-"}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  <div className="flex items-center justify-end gap-2">
                    {acc.status_code !== "valid" && acc.status_code !== "rate_limited" && acc.status_code !== "banned" && (
                      <Button variant="outline" size="sm" onClick={() => handleActivate(acc.email)} className="text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/10 font-medium">
                        <MailWarning className="h-4 w-4 mr-1" /> {t("accounts.actions.activate")}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleVerify(acc.email)} disabled={verifying === acc.email} title={t("accounts.actions.verifyTitle")}>
                      {verifying === acc.email ? <RefreshCw className="h-4 w-4 animate-spin text-blue-500" /> : <ShieldCheck className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(acc.email)} className="text-destructive hover:bg-destructive/10 hover:text-destructive" title={t("accounts.actions.deleteTitle")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
