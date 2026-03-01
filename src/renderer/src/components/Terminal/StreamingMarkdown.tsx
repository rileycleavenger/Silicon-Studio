import { useState, useEffect, useRef, memo } from 'react'
import ReactMarkdown from 'react-markdown'

const DEBOUNCE_MS = 120

/**
 * Memoized markdown renderer — only re-renders when `content` prop changes.
 * Wrapping ReactMarkdown in memo prevents parent re-renders from
 * triggering an expensive markdown parse.
 */
const MemoizedMarkdown = memo(function MemoizedMarkdown({ content }: { content: string }) {
  return <ReactMarkdown>{content}</ReactMarkdown>
})

/**
 * Renders markdown with debounced updates during streaming.
 *
 * While content is actively growing (token-by-token), this component
 * debounces the expensive ReactMarkdown parse. It shows the last-rendered
 * markdown plus a raw-text tail for the un-parsed portion, so the user
 * always sees the latest text without lag.
 *
 * When content stops growing (stream done), it renders the final markdown
 * immediately.
 */
export function StreamingMarkdown({ content }: { content: string }) {
  const [renderedContent, setRenderedContent] = useState(content)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevLenRef = useRef(content.length)

  useEffect(() => {
    const isGrowing = content.length > prevLenRef.current
    prevLenRef.current = content.length

    if (!isGrowing) {
      // Content replaced or stream finished — render immediately
      if (timerRef.current) clearTimeout(timerRef.current)
      setRenderedContent(content)
      return
    }

    // Content is growing (streaming) — debounce the markdown parse
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setRenderedContent(content)
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [content])

  // If markdown hasn't caught up, show the tail as raw text
  const tail = content.slice(renderedContent.length)

  return (
    <>
      <MemoizedMarkdown content={renderedContent} />
      {tail && <span className="whitespace-pre-wrap">{tail}</span>}
    </>
  )
}
