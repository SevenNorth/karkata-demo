import { useEffect, useSyncExternalStore, useState } from 'react'
import { Bot, LayoutTemplate } from 'lucide-react'
import { createAgentUIStore } from '@karkata-ai/ui'
import { ChatPanel } from './ChatPanel'
import { createBrowserAgent } from './agent'

const browserAgent = createBrowserAgent()
const agentStore = createAgentUIStore(browserAgent)
type Usage = { dailyLimitTokens: number; usedTokens: number; reservedTokens: number; remainingTokens: number; resetsAt: string }

export function App() {
  const [auth, setAuth] = useState<{ authenticated: boolean; user: { login: string; avatarUrl: string | null } | null }>({ authenticated: false, user: null })
  const [usage, setUsage] = useState<Usage | null>(null)
  const [panelMode, setPanelMode] = useState<'embedded' | 'floating' | 'minimized'>('embedded')
  const [restoreMode, setRestoreMode] = useState<'embedded' | 'floating'>('embedded')
  const agentState = useSyncExternalStore(agentStore.subscribe.bind(agentStore), agentStore.getSnapshot.bind(agentStore), agentStore.getSnapshot.bind(agentStore))
  const minimize = () => { setRestoreMode(panelMode === 'minimized' ? restoreMode : panelMode); setPanelMode('minimized') }
  const restore = () => setPanelMode(restoreMode)
  const togglePlacement = () => { const next = panelMode === 'embedded' ? 'floating' : 'embedded'; setRestoreMode(next); setPanelMode(next) }
  useEffect(() => { fetch('/api/me', { credentials: 'include' }).then((response) => response.ok ? response.json() : null).then((value) => { if (value) setAuth(value) }).catch(() => undefined) }, [])
  const refreshUsage = async () => { const response = await fetch('/api/usage', { credentials: 'include' }); if (response.ok) setUsage(await response.json() as Usage) }
  useEffect(() => { if (auth.authenticated) void refreshUsage(); else setUsage(null) }, [auth.authenticated])
  const submitAgent = async (input: string) => { try { return await agentStore.submit(input) } finally { await refreshUsage() } }
  const logout = async () => { agentStore.abort(); browserAgent.clearHistory(); await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); setAuth({ authenticated: false, user: null }); setUsage(null) }
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Bot size={18} /></div><div><strong>Karkata Lab</strong><span>Browser Agent playground</span></div></div>
        <div className="topbar-actions">{usage && <span className="quota-label" title={`每日 ${usage.dailyLimitTokens.toLocaleString()} tokens，${new Date(usage.resetsAt).toLocaleString()} 重置`}>剩余 {formatTokens(usage.remainingTokens)}</span>} {auth.user && <button className="user-chip" title="退出 GitHub 登录" onClick={logout}>@{auth.user.login}</button>}</div>
      </header>
      <section className={`workspace panel-${panelMode}`}>
        <div className="canvas-area">
          <div className="canvas-heading"><div><p className="eyebrow">DEMO CANVAS</p><h1>留给真实场景的演示画布</h1><p className="lede">这里将承载具体的 Karkata 使用场景。右侧面板已经接入交互骨架，后续可以在不改布局的情况下接入工具和真实模型。</p></div><button className="outline-button"><LayoutTemplate size={16} /> 场景占位</button></div>
          <div className="empty-canvas"><div className="empty-icon"><LayoutTemplate size={28} /></div><strong>还没有选择演示内容</strong><span>先确定业务场景，再把页面状态注册为浏览器工具。</span></div>
        </div>
        <ChatPanel mode={panelMode} authenticated={auth.authenticated} agentState={agentState} onSubmit={submitAgent} onAbort={() => agentStore.abort()} onMinimize={minimize} onRestore={restore} onTogglePlacement={togglePlacement} />
      </section>
    </main>
  )
}

function formatTokens(value: number): string { return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value) }
