import { useState } from 'react'
import { Bot, LayoutTemplate } from 'lucide-react'
import { ChatPanel } from './ChatPanel'

export function App() {
  const [panelMode, setPanelMode] = useState<'embedded' | 'floating' | 'minimized'>('embedded')
  const [restoreMode, setRestoreMode] = useState<'embedded' | 'floating'>('embedded')
  const minimize = () => { setRestoreMode(panelMode === 'minimized' ? restoreMode : panelMode); setPanelMode('minimized') }
  const restore = () => setPanelMode(restoreMode)
  const togglePlacement = () => { const next = panelMode === 'embedded' ? 'floating' : 'embedded'; setRestoreMode(next); setPanelMode(next) }
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Bot size={18} /></div><div><strong>Karkata Lab</strong><span>Browser Agent playground</span></div></div>
        <div className="topbar-actions"><span className="status-dot" /> Proxy offline scaffold</div>
      </header>
      <section className={`workspace panel-${panelMode}`}>
        <div className="canvas-area">
          <div className="canvas-heading"><div><p className="eyebrow">DEMO CANVAS</p><h1>留给真实场景的演示画布</h1><p className="lede">这里将承载具体的 Karkata 使用场景。右侧面板已经接入交互骨架，后续可以在不改布局的情况下接入工具和真实模型。</p></div><button className="outline-button"><LayoutTemplate size={16} /> 场景占位</button></div>
          <div className="empty-canvas"><div className="empty-icon"><LayoutTemplate size={28} /></div><strong>还没有选择演示内容</strong><span>先确定业务场景，再把页面状态注册为浏览器工具。</span></div>
        </div>
        <ChatPanel mode={panelMode} onMinimize={minimize} onRestore={restore} onTogglePlacement={togglePlacement} />
      </section>
    </main>
  )
}
