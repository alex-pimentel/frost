import React, { useState, useRef, useEffect } from 'react'
import { MessageBubble } from './MessageBubble'

export function ChatModeView() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim()) return
    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    // Task 7 will replace this with a call to window.electronAPI.frostChat(input)
    const response = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `[Frost response to: ${input}]`,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, response])
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-sm select-none">
            Start a conversation
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>
      <div className="border-t border-border/30 p-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-border/30 bg-surface-1 px-4 py-2 text-sm outline-none focus:border-primary/30"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
          />
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={sendMessage}
            disabled={!input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
