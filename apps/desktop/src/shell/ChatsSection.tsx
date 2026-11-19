import { useStore } from '@nanostores/react'
import { IconChevronDown, IconChevronRight, IconMessages, IconRefresh } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/cn.ts'
import { formatRelative } from '../lib/format.ts'
import { $activeChatId, $chats, openStoredSession } from '../store/chat.ts'
import { $chatGroups, $chatGroupsError, $chatGroupsLoading, GROUP_PREVIEW, loadChatGroups } from '../store/chat-browser.ts'
import { $connection } from '../store/gateway.ts'
import { notify } from '../store/notifications.ts'
import { setSidebarCollapsed } from '../store/sidebar.ts'
import { showPage } from '../store/windows.ts'

/*
 * Chats, grouped by project, in the left rail: the reason to switch conversations without walking
 * through the Hermes page first. Grouping comes from Hermes (`projects.tree`), so it matches the
 * project list the Hermes desktop app shows, including the bucket for chats that belong to none.
 */
export function ChatsSection({ collapsed }: { collapsed: boolean }) {
  const groups = useStore($chatGroups)
  const loading = useStore($chatGroupsLoading)
  const error = useStore($chatGroupsError)
  const connection = useStore($connection)
  const activeId = useStore($activeChatId)
  const chats = useStore($chats)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // The open conversation's stored id, so its group starts expanded and its row is marked.
  const activeStoredId = useMemo(() => {
    const active = activeId ? chats[activeId] : undefined

    return active?.storedSessionId ?? null
  }, [activeId, chats])

  useEffect(() => {
    if (connection === 'open') {
      void loadChatGroups()
    }
  }, [connection])

  useEffect(() => {
    if (!activeStoredId) {
      return
    }

    const holding = groups.find(group => group.chats.some(chat => chat.id === activeStoredId))

    if (holding) {
      setOpen(prev => (prev.has(holding.id) ? prev : new Set(prev).add(holding.id)))
    }
  }, [activeStoredId, groups])

  const toggle = (id: string) => {
    setOpen(prev => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  const openChat = (storedId: string) => {
    showPage('hermes')
    void openStoredSession(storedId).catch((failure: unknown) => {
      notify({ title: 'Could not open that chat', body: failure instanceof Error ? failure.message : String(failure), level: 'error', surface: 'hermes' })
    })
  }

  if (collapsed) {
    // The rail has no room for a tree; the row expands the sidebar instead of hiding the chats entirely.
    return (
      <button
        type="button"
        onClick={() => setSidebarCollapsed(false)}
        aria-label="Chats"
        className="side-item group relative mt-2 flex size-7 items-center justify-center rounded-lg hover:bg-white/8"
      >
        <IconMessages size={14} className="text-fg-3 group-hover:text-fg" />
        <span className="side-tip">Chats</span>
      </button>
    )
  }

  return (
    <div className="mt-4 flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-1 px-2">
        <span className="min-w-0 truncate text-[10px] font-semibold tracking-[0.14em] text-fg-3 uppercase">Chats</span>
        <button
          type="button"
          onClick={() => void loadChatGroups()}
          aria-label="Refresh chats"
          title="Refresh chats"
          className={cn('flex size-5 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-white/10 hover:text-fg', loading && 'animate-spin')}
        >
          <IconRefresh size={12} />
        </button>
      </div>

      <div className="mt-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {groups.length === 0 && !loading && !error && <div className="px-2.5 py-1.5 text-[11.5px] text-fg-4">No chats yet</div>}
        {error && groups.length === 0 && <div className="px-2.5 py-1.5 text-[11.5px] text-danger">{error}</div>}

        {groups.map(group => {
          const isOpen = open.has(group.id)
          const shown = expanded.has(group.id) ? group.chats : group.chats.slice(0, GROUP_PREVIEW)
          const hidden = group.chats.length - shown.length

          return (
            <section key={group.id} className="min-w-0">
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-expanded={isOpen}
                className="flex h-7 w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-[12px] text-fg-2 transition-colors duration-150 hover:bg-white/8 hover:text-fg"
              >
                {isOpen ? <IconChevronDown size={12} className="shrink-0 text-fg-3" /> : <IconChevronRight size={12} className="shrink-0 text-fg-3" />}
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: group.color ?? 'var(--fg-3)' }} />
                <span className={cn('min-w-0 flex-1 truncate', group.isNoProject && 'italic')} title={group.label}>
                  {group.label}
                </span>
                <span className="shrink-0 text-[10.5px] text-fg-4">{group.count}</span>
              </button>

              {isOpen && (
                <div className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-line pl-1.5">
                  {shown.map(chat => {
                    const active = chat.id === activeStoredId

                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => openChat(chat.id)}
                        aria-current={active ? 'true' : undefined}
                        title={chat.title}
                        className={cn(
                          'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition-colors duration-150',
                          active ? 'bg-white/14 text-fg' : 'text-fg-2 hover:bg-white/8 hover:text-fg'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                        <span className="shrink-0 text-[10px] text-fg-4">{formatRelative(chat.at)}</span>
                      </button>
                    )
                  })}

                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => new Set(prev).add(group.id))}
                      className="h-6 rounded-md px-2 text-left text-[11px] text-fg-3 hover:bg-white/8 hover:text-fg"
                    >
                      Show {hidden} more
                    </button>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
