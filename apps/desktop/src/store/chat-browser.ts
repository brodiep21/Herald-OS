import { atom } from 'nanostores'
import { gatewayRequest, isGatewayOpen } from './gateway.ts'

/*
 * The sidebar's chat browser: Hermes's own project grouping, so a chat is reachable in one click
 * instead of only through the Hermes page. `projects.tree` is the same grouping the Hermes desktop
 * app shows (explicit projects, auto git-root projects and the synthetic Home bucket).
 */

export interface BrowserChat {
  id: string
  title: string
  /** Newest activity first; falls back to `started_at` when a row has no `last_active`. */
  at: number
  model?: string | null
}

export interface BrowserGroup {
  id: string
  label: string
  color?: string | null
  /** The synthetic bucket for sessions that belong to no project. */
  isNoProject: boolean
  count: number
  chats: BrowserChat[]
}

/** How many chats a group shows before "show all"; Hermes caps the request at `session_limit`. */
export const GROUP_PREVIEW = 8
const TREE_SESSION_LIMIT = 40

export const $chatGroups = atom<BrowserGroup[]>([])
export const $chatGroupsLoading = atom(false)
export const $chatGroupsError = atom<string | null>(null)

interface TreeSession {
  id: string
  title?: string | null
  preview?: string | null
  model?: string | null
  started_at?: number | null
  last_active?: number | null
  ended_at?: number | null
}

interface TreeNode {
  id: string
  label: string
  color?: string | null
  isNoProject?: boolean
  sessionCount?: number
  lastActive?: number
  previewSessions?: TreeSession[]
}

let inflight: Promise<void> | null = null

const chatTitle = (session: TreeSession): string => session.title?.trim() || session.preview?.trim()?.slice(0, 60) || 'Untitled chat'

/** Activity timestamp in ms; Hermes reports seconds. */
const chatTime = (session: TreeSession): number => {
  const raw = session.last_active ?? session.started_at ?? session.ended_at ?? 0

  return raw > 1e12 ? raw : raw * 1000
}

function toGroup(node: TreeNode): BrowserGroup {
  const sessions = (node.previewSessions ?? [])
    .map(session => ({ id: session.id, title: chatTitle(session), at: chatTime(session), model: session.model ?? null }))
    .sort((a, b) => b.at - a.at)

  return {
    id: node.id,
    label: node.label?.trim() || 'Chats',
    color: node.color ?? null,
    isNoProject: Boolean(node.isNoProject),
    count: node.sessionCount ?? sessions.length,
    chats: sessions
  }
}

/** Nesting depth guard: a project with no sessions still shows, an empty tree is not an error. */
function toGroups(nodes: readonly TreeNode[]): BrowserGroup[] {
  return nodes
    .map(toGroup)
    .filter(group => group.chats.length > 0 || group.count > 0)
    .sort((ax, bx) => (bx.chats[0]?.at ?? 0) - (ax.chats[0]?.at ?? 0))
}

/** Reload the project → chats tree. Safe to call on every render: one request in flight at a time. */
export function loadChatGroups(): Promise<void> {
  if (!isGatewayOpen()) {
    return Promise.resolve()
  }

  if (inflight) {
    return inflight
  }

  $chatGroupsLoading.set(true)
  $chatGroupsError.set(null)

  inflight = gatewayRequest('projects.tree', { preview_limit: GROUP_PREVIEW, session_limit: TREE_SESSION_LIMIT })
    .then(result => {
      $chatGroups.set(toGroups(result.projects ?? []))
    })
    .catch((error: unknown) => {
      // Keep the previous tree on screen; say why it may be stale.
      $chatGroupsError.set(error instanceof Error ? error.message : String(error))
    })
    .finally(() => {
      $chatGroupsLoading.set(false)
      inflight = null
    })

  return inflight
}
