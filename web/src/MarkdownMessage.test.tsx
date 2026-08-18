import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownMessage } from './MarkdownMessage'

describe('MarkdownMessage', () => {
  it('renders GFM content without enabling raw HTML', () => {
    const html = renderToStaticMarkup(<MarkdownMessage content={'## 当前状态\n\n| 项目 | 数值 |\n| --- | --- |\n| **天数** | 1 |\n\n<script>alert(1)</script>'} />)

    expect(html).toContain('<h2>当前状态</h2>')
    expect(html).toContain('<table>')
    expect(html).toContain('<strong>天数</strong>')
    expect(html).not.toContain('<script>')
  })
})
