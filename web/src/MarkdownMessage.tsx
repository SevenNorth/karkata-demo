import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownMessage({ content }: { content: string }) {
  return <div className="markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ node: _node, ...props }) => <div className="markdown-table-scroll"><table {...props} /></div>,
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    >{content}</ReactMarkdown>
  </div>
}
