import { beforeEach, describe, expect, it, vi } from 'vitest'

// The grouping is pure; only Hermes's socket is faked, so these assert what the sidebar will show.
const edges = vi.hoisted(() => ({
  open: true,
  fail: null as Error | null,
  tree: { projects: [] as unknown[] },
  calls: [] as string[]
}))

vi.mock('./gateway.ts', async () => {
  const { atom } = await import('nanostores')

  return {
    $connection: atom('open'),
    isGatewayOpen: () => edges.open,
    gatewayRequest: async (method: string) => {
      edges.calls.push(method)

      if (edges.fail) {
        throw edges.fail
      }

      return method === 'projects.tree' ? edges.tree : {}
    }
  }
})

const { $chatGroups, $chatGroupsError, loadChatGroups } = await import('./chat-browser.ts')

const project = (id: string, label: string, sessions: unknown[], extra: Record<string, unknown> = {}) => ({ id, label, previewSessions: sessions, sessionCount: sessions.length, ...extra })
const session = (id: string, title: string | null, lastActive: number, preview: string | null = null) => ({ id, title, preview, last_active: lastActive })

describe('chat browser', () => {
  beforeEach(() => {
    edges.open = true
    edges.fail = null
    edges.calls = []
    edges.tree = { projects: [] }
    $chatGroups.set([])
    $chatGroupsError.set(null)
  })

  it('groups chats by project and puts the most recently used project first', async () => {
    edges.tree = {
      projects: [project('p-brain', 'Brain', [session('a', 'Older chat', 1_700_000_000)]), project('p-work', 'Work', [session('b', 'Newer chat', 1_760_000_000)])]
    }

    await loadChatGroups()

    expect($chatGroups.get().map(group => group.label)).toEqual(['Work', 'Brain'])
    expect($chatGroups.get()[0]!.chats.map(chat => chat.id)).toEqual(['b'])
  })

  it('orders chats inside a group newest first and normalises Hermes seconds to ms', async () => {
    edges.tree = {
      projects: [project('p', 'P', [session('old', 'Old', 1_600_000_000), session('new', 'New', 1_700_000_000)])]
    }

    await loadChatGroups()

    const [group] = $chatGroups.get()
    expect(group!.chats.map(chat => chat.id)).toEqual(['new', 'old'])
    // Seconds in, ms out: formatRelative reads a value under 1e12 as seconds.
    expect(group!.chats[0]!.at).toBe(1_700_000_000_000)
  })

  it('falls back to the preview, then to a placeholder, when a chat has no title', async () => {
    edges.tree = { projects: [project('p', 'P', [session('a', null, 1_700_000_000, 'a preview of the first message'), session('b', '   ', 1_700_000_100)])] }

    await loadChatGroups()

    expect($chatGroups.get()[0]!.chats.map(chat => chat.title)).toEqual(['Untitled chat', 'a preview of the first message'])
  })

  it('keeps a project with chats it has not previewed, so its count still shows', async () => {
    edges.tree = { projects: [project('p', 'P', [], { sessionCount: 7 })] }

    await loadChatGroups()

    expect($chatGroups.get()).toHaveLength(1)
    expect($chatGroups.get()[0]!.count).toBe(7)
  })

  it('keeps the tree on screen and records why when the read fails', async () => {
    edges.tree = { projects: [project('p', 'P', [session('a', 'Kept', 1_700_000_000)])] }
    await loadChatGroups()

    edges.fail = new Error('gateway closed')
    await loadChatGroups()

    expect($chatGroups.get().map(group => group.label)).toEqual(['P'])
    expect($chatGroupsError.get()).toBe('gateway closed')
  })

  it('does not call Hermes while the socket is closed', async () => {
    edges.open = false

    await loadChatGroups()

    expect(edges.calls).toEqual([])
  })
})
