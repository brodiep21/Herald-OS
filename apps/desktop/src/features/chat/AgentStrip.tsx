import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { rest } from '../../lib/rest.ts'
import { $activeChat } from '../../store/chat.ts'
import { $connection, gatewayRequest } from '../../store/gateway.ts'

/*
 * What is answering, on every chat: the provider and model for this conversation, and where its
 * tools run. Hermes keeps the model per session, so two chats can differ. A session that reports
 * none (a resumed chat, a turn that never started) falls back to the runtime's current default,
 * because an empty strip is exactly what hid a wrong model before.
 */

interface BackendsPayload {
  active: string
  backends: { name: string; label?: string }[]
}

interface ModelOptions {
  provider?: string | null
  model?: string | null
}

const shortModel = (model: string): string => (model.includes('/') ? model.slice(model.indexOf('/') + 1) : model)

export function AgentStrip() {
  const chat = useStore($activeChat)
  const connection = useStore($connection)
  const [backend, setBackend] = useState<string | null>(null)
  const [fallback, setFallback] = useState<ModelOptions | null>(null)

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

  const reported = Boolean(chat?.info.provider?.trim() || chat?.info.model?.trim())

  useEffect(() => {
    if (reported || connection !== 'open') {
      return
    }

    let live = true

    gatewayRequest('model.options', { include_unconfigured: false })
      .then(options => {
        if (live) {
          setFallback({ provider: options.provider ?? null, model: options.model ?? null })
        }
      })
      .catch(() => {
        if (live) {
          setFallback(null)
        }
      })

    return () => {
      live = false
    }
  }, [reported, connection])

  const provider = chat?.info.provider?.trim() || fallback?.provider?.trim() || null
  const model = chat?.info.model?.trim() || fallback?.model?.trim() || null
  const fromDefault = !reported && Boolean(model)

  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
      <span
        className="flex h-6 max-w-[280px] items-center gap-1.5 rounded-full border border-line bg-black/20 px-2.5 text-fg-2"
        title={fromDefault ? "This chat reports no model of its own, so this is Hermes's current default" : (model ?? undefined)}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span className="truncate">
          {provider ?? 'provider unknown'}
          {model ? ` · ${shortModel(model)}` : ''}
        </span>
        {fromDefault && <span className="shrink-0 text-[10px] text-fg-4">default</span>}
      </span>
      {backend && (
        <span className="flex h-6 items-center rounded-full border border-line bg-black/20 px-2.5 text-fg-2" title="Where this chat's tools run">
          {backend}
        </span>
      )}
    </div>
  )
}
