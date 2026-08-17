import { useRef, useState } from 'react'
import { Bot, Github, Minus, PanelRightDashed, Send, Square, SquareArrowOutUpLeft, UserRound } from 'lucide-react'

type ChatPanelProps = { mode: 'embedded' | 'floating' | 'minimized'; onMinimize: () => void; onRestore: () => void; onTogglePlacement: () => void }

export function ChatPanel({ mode, onMinimize, onRestore, onTogglePlacement }: ChatPanelProps) {
  const minimized = mode === 'minimized'
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([{ role: 'assistant', content: '你好，我是 Karkata 的浏览器 Agent。先把右侧面板当作交互占位，后续会接入真实工具和 LLM。' }])
  const [loginPrompt, setLoginPrompt] = useState(true)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const submit = () => { const content = draft.trim(); if (!content) return; setMessages((items) => [...items, { role: 'user', content }]); setDraft('') }
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (mode !== 'floating' || event.target instanceof Element && event.target.closest('button')) return; setDragging(true); dragOrigin.current = { x: event.clientX, y: event.clientY, px: position.x, py: position.y }; event.currentTarget.setPointerCapture(event.pointerId) }
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragging) return; setPosition({ x: dragOrigin.current.px + event.clientX - dragOrigin.current.x, y: dragOrigin.current.py + event.clientY - dragOrigin.current.y }) }
  const stopDrag = () => setDragging(false)
  return <aside className={`chat-panel panel-${mode}`} style={mode === 'floating' ? { transform: `translate(${position.x}px, ${position.y}px)` } : undefined}>
    <div className="panel-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onClick={minimized ? onRestore : undefined}><div className="panel-title"><div className="panel-icon"><Bot size={16} /></div><div><strong>Karkata Agent</strong></div></div>{!minimized && <div className="panel-actions"><button className="icon-button" title="最小化" onClick={onMinimize}><Minus size={16} /></button><button className="icon-button" title={mode === 'floating' ? '回到右侧嵌入' : '弹出为浮动窗口'} onClick={onTogglePlacement}>{mode === 'floating' ? <PanelRightDashed size={15} /> : <SquareArrowOutUpLeft size={15} />}</button></div>}</div>
    {!minimized && <><div className="message-list">{messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${message.role}-${index}`}><div className="message-avatar">{message.role === 'assistant' ? <Bot size={14} /> : <UserRound size={14} />}</div><div className="message-bubble">{message.content}</div></div>)}</div>
    <div className="panel-composer"><div className="composer-fields"><textarea disabled={loginPrompt} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder="输入一条消息…" rows={2} /><div className="composer-actions"><span>Enter 发送 · Shift+Enter 换行</span><button className="stop-button" title="停止运行"><Square size={14} /></button><button className="send-button" title="发送" onClick={submit}><Send size={15} /></button></div>{loginPrompt && <div className="login-overlay"><strong>登录后开始对话</strong><span>使用 GitHub 登录，保护你的会话与额度。</span><button className="github-button" onClick={() => setLoginPrompt(false)}><Github size={15} /> 使用 GitHub 登录</button></div>}</div></div></>}
  </aside>
}
