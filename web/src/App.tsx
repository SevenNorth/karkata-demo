import { useEffect, useState, useSyncExternalStore } from 'react'
import { Bot, Coins, Heart, Sun } from 'lucide-react'
import { createAgentUIStore } from '@karkata-ai/ui'
import { ChatPanel } from './ChatPanel'
import { createBrowserAgent } from './agent'
import { FarmCanvas } from './FarmCanvas'
import { FarmSimulation } from './farmSimulation'
import { createFarmTools } from './farmTools'

type Usage = { dailyLimitTokens: number; usedTokens: number; reservedTokens: number; remainingTokens: number; resetsAt: string }

export function App() {
  const [farm] = useState(() => new FarmSimulation())
  const [browserAgent] = useState(() => createBrowserAgent(fetch, createFarmTools(farm)))
  const [agentStore] = useState(() => createAgentUIStore(browserAgent))
  const [auth, setAuth] = useState<{ authenticated: boolean; user: { login: string; avatarUrl: string | null } | null }>({ authenticated: false, user: null })
  const [usage, setUsage] = useState<Usage | null>(null)
  const [panelMode, setPanelMode] = useState<'embedded' | 'floating' | 'minimized'>('embedded')
  const [restoreMode, setRestoreMode] = useState<'embedded' | 'floating'>('embedded')
  const agentState = useSyncExternalStore(agentStore.subscribe.bind(agentStore), agentStore.getSnapshot.bind(agentStore), agentStore.getSnapshot.bind(agentStore))
  const farmState = useSyncExternalStore(farm.subscribe.bind(farm), farm.snapshot.bind(farm), farm.snapshot.bind(farm))
  const minimize = () => { setRestoreMode(panelMode === 'minimized' ? restoreMode : panelMode); setPanelMode('minimized') }
  const restore = () => setPanelMode(restoreMode)
  const togglePlacement = () => { const next = panelMode === 'embedded' ? 'floating' : 'embedded'; setRestoreMode(next); setPanelMode(next) }
  useEffect(() => { fetch('/api/me', { credentials: 'include' }).then((response) => response.ok ? response.json() : null).then((value) => { if (value) setAuth(value) }).catch(() => undefined) }, [])
  const refreshUsage = async () => { const response = await fetch('/api/usage', { credentials: 'include' }); if (response.ok) setUsage(await response.json() as Usage) }
  useEffect(() => { if (auth.authenticated) void refreshUsage(); else setUsage(null) }, [auth.authenticated])
  const submitAgent = async (input: string) => { try { return await agentStore.submit(input) } finally { await refreshUsage() } }
  const logout = async () => { agentStore.abort(); browserAgent.clearHistory(); await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); setAuth({ authenticated: false, user: null }); setUsage(null) }
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Bot size={18} /></div><div><strong>Karkata Farm</strong><span>Browser Agent playground</span></div></div><div className="topbar-actions">{usage && <span className="quota-label">剩余 {formatTokens(usage.remainingTokens)}</span>}{auth.user && <button className="user-chip" title="退出 GitHub 登录" onClick={logout}>@{auth.user.login}</button>}</div></header>
    <section className={`workspace panel-${panelMode}`}>
      <div className="canvas-area"><div className="farm-stage"><div className="farm-hud"><strong>第 {farmState.day} 天</strong><span><Sun size={13} /> {farmState.time}</span><span><Heart size={13} /> {farmState.energy}</span><span><Coins size={13} /> {farmState.gold}</span><em>{farmState.message}</em></div><FarmCanvas simulation={farm} /></div></div>
      <ChatPanel mode={panelMode} authenticated={auth.authenticated} agentState={agentState} onSubmit={submitAgent} onAbort={() => agentStore.abort()} onMinimize={minimize} onRestore={restore} onTogglePlacement={togglePlacement} />
    </section>
  </main>
}

function formatTokens(value: number): string { return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value) }
