import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { rest } from '../../lib/rest.ts'
import { $activeChat } from '../../store/chat.ts'

/*
 * What is answering, on every chat: the provider and model the runtime reports for this
 * conversation, and where its tools run. Hermes keeps these per session, so two chats can differ;
 * showing it here is how you notice a switch that did not take.
 */

interface BackendsPayload {
  active: string
  backends: { name: string; label?: string }[]
}

const shortModel = (model: string): string => (model.includes('/') ? model.slice(model.indexOf('/') + 1) : model)

export function AgentStrip() {
  const chat = useStore($activeChat)
  const [backend, setBackend] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    rest
      .get<BackendsPayload>('/api/tools/terminal/backends')
      .then(payload => {
        if (!live) {
          return
        }

        const active = payload.backends?.find(row => row.name === payload.active)

        setBackend(payload.active === 'local' ? 'This device' : (active?.label ?? payload.active))
      })
      .catch(() => {
        if (live) {
          setBackend(null)
        }
      })

    return () => {
      live = false
    }
  }, [])

  const provider = chat?.info.provider?.trim() || null
  const model = chat?.info.model?.trim() || null

  if (!chat) {
    return null
  }

  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
      <span className="flex h-6 max-w-[260px] items-center gap-1.5 rounded-full border border-line bg-black/20 px-2.5 text-fg-2" title={model ?? undefined}>
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span className="truncate">
          {provider ?? 'provider unknown'}
          {model ? ` · ${shortModel(model)}` : ''}
        </span>
      </span>
      {backend && (
        <span className="flex h-6 items-center rounded-full border border-line bg-black/20 px-2.5 text-fg-2" title="Where this chat's tools run">
          {backend}
        </span>
      )}
    </div>
  )
}
