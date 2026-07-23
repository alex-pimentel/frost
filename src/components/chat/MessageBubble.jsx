import React from 'react'

export function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-surface-1 text-foreground border border-border/30'
        }`}
      >
        <p className="text-sm">{message.content}</p>
      </div>
    </div>
  )
}
