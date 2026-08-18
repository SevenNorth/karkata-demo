import { useEffect, useRef, useState } from 'react'
import { Bot, Github, Minus, PanelRightDashed, Send, Square, SquareArrowOutUpLeft, UserRound } from 'lucide-react'
import type { AgentUIState, AgentUISubmitResult } from '@karkata-ai/ui'
import { MarkdownMessage } from './MarkdownMessage'

type ChatPanelProps = { mode: 'embedded' | 'floating' | 'minimized'; authenticated: boolean; agentState: Readonly<AgentUIState>; onSubmit: (input: string) => Promise<AgentUISubmitResult>; onAbort: () => void; onMinimize: () => void; onRestore: () => void; onTogglePlacement: () => void }

export function ChatPanel({ mode, authenticated, agentState, onSubmit, onAbort, onMinimize, onRestore, onTogglePlacement }: ChatPanelProps) {
  const minimized = mode === 'minimized'
  const [draft, setDraft] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const messageList = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  useEffect(() => {
    if (!followLatest.current) return
    const frame = requestAnimationFrame(() => { messageList.current?.scrollTo({ top: messageList.current.scrollHeight }) })
    return () => cancelAnimationFrame(frame)
  }, [agentState.revision])
  const submit = async () => { const content = draft.trim(); if (!content || !authenticated) return; setSubmitError(null); setDraft(''); try { await onSubmit(content) } catch { setDraft(content); setSubmitError('消息发送失败，请稍后重试。') } }
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (mode !== 'floating' || event.target instanceof Element && event.target.closest('button')) return; setDragging(true); dragOrigin.current = { x: event.clientX, y: event.clientY, px: position.x, py: position.y }; event.currentTarget.setPointerCapture(event.pointerId) }
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragging) return; setPosition({ x: dragOrigin.current.px + event.clientX - dragOrigin.current.x, y: dragOrigin.current.py + event.clientY - dragOrigin.current.y }) }
  const stopDrag = () => setDragging(false)
  return <aside className={`chat-panel panel-${mode}`} style={mode === 'floating' ? { transform: `translate(${position.x}px, ${position.y}px)` } : undefined}>
    <div className="panel-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onClick={minimized ? onRestore : undefined}><div className="panel-title"><div className="panel-icon"><Bot size={16} /></div><div><strong>Karkata Agent</strong></div></div>{!minimized && <div className="panel-actions"><button className="icon-button" title="最小化" onClick={onMinimize}><Minus size={16} /></button><button className="icon-button" title={mode === 'floating' ? '回到右侧嵌入' : '弹出为浮动窗口'} onClick={onTogglePlacement}>{mode === 'floating' ? <PanelRightDashed size={15} /> : <SquareArrowOutUpLeft size={15} />}</button></div>}</div>
    {!minimized && <><div className="message-list" ref={messageList} onScroll={(event) => { const element = event.currentTarget; followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48 }}>{agentState.items.length === 0 && <div className="chat-empty"><Bot size={20} /><strong>告诉 Agent 你想做什么</strong><span>例如：去商店买种子，种好左上角三块地。</span><span>也可以让它收获售卖、整理仓库或回房睡觉。</span></div>}{agentState.items.map((item) => item.type === 'message' ? <div className={`message-row ${item.role}`} key={item.id}><div className="message-avatar">{item.role === 'assistant' ? <Bot size={14} /> : <UserRound size={14} />}</div><div className={`message-bubble ${item.contentStatus}`}><MarkdownMessage content={item.content} /></div></div> : <div className={`tool-row ${item.status}`} key={item.id}>工具 {item.name} · {item.status}</div>)}{agentState.error && <div className="agent-error">{agentState.error.message}</div>}</div>
    <div className="panel-composer"><div className="composer-fields"><textarea disabled={!authenticated || agentState.status === 'running' || agentState.status === 'waiting_for_input'} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} placeholder="输入一条消息…" rows={2} /><div className="composer-actions"><span>{agentState.status === 'running' ? '正在生成…' : 'Enter 发送 · Shift+Enter 换行'}</span><button className="stop-button" disabled={agentState.status !== 'running' && agentState.status !== 'waiting_for_input'} title="停止运行" onClick={onAbort}><Square size={14} /></button><button className="send-button" disabled={!authenticated || !draft.trim() || agentState.status === 'running' || agentState.status === 'waiting_for_input'} title="发送" onClick={() => void submit()}><Send size={15} /></button></div>{submitError && <div className="submit-error">{submitError}</div>}{!authenticated && <div className="login-overlay"><strong>登录后开始对话</strong><span>使用 GitHub 登录，保护你的会话与额度。</span><button className="github-button" onClick={() => { window.location.href = '/auth/github' }}><Github size={15} /> 使用 GitHub 登录</button></div>}</div></div></>}
  </aside>
}
