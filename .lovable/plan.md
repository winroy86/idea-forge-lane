
## Admin Dashboard & Usage Tracking System

### Goal Summary

Add a two-tier user system:
- **Admin users** — see a new admin dashboard showing all users' rooms and agents across the platform
- **Regular users** — experience zero change from today; their data is synced to the database silently in the background

No conversation content (messages) is ever stored in the database. Only structural metadata: room titles/goals, agent names/roles/providers, and skill names.

---

### Architecture Overview

```text
Database (new tables)
├── user_roles          — maps user_id → 'admin' | 'user'
├── room_snapshots      — per-user room metadata (title, goal, agentIds, orchestration, createdAt)
└── agent_snapshots     — per-user agent metadata (name, role, domain, provider, model, createdAt)
    (NO skill_snapshots — skills are built-in/imported locally, lower value for analytics)

RLS policies
├── room_snapshots: user can INSERT/UPDATE/DELETE their own rows; admin can SELECT all
├── agent_snapshots: same pattern
└── user_roles: users can only read their own role; only server-side (service role) can write

Security helper
└── has_role(user_id, role) — security definer function (prevents RLS recursion)
```

---

### What Gets Synced & When

| Event | Data synced | What is NOT stored |
|---|---|---|
| User creates a room | title, goal, orchestration, agentIds count | conversation messages |
| User opens a room | last_opened_at updated (upsert) | message contents |
| User saves an agent | name, role, domain, provider, model | system prompts, API keys |
| User creates a skill | name, category, description | skill step code |

All syncing is **fire-and-forget** — it never blocks the UI. If it fails silently (e.g. network down), the user experience is unaffected.

---

### Files to Create / Modify

**Database migrations (2 new files)**

1. `supabase/migrations/..._user_roles.sql`
   - `app_role` enum: `'admin' | 'user'`
   - `user_roles` table with RLS: users read own row, no direct writes
   - `has_role(user_id, role)` security definer function

2. `supabase/migrations/..._usage_tracking.sql`
   - `room_snapshots` table: `id, user_id, room_id (text), title, goal, orchestration, agent_count, created_at, last_opened_at, updated_at`
   - `agent_snapshots` table: `id, user_id, agent_id (text), name, role, domain, provider, model, created_at, updated_at`
   - RLS: users manage their own rows; admins (via `has_role`) can SELECT all rows

**New file: `src/lib/usageSync.ts`**

A lightweight module with fire-and-forget functions:
- `syncRoom(room: Room): void` — upserts a row in `room_snapshots`
- `syncAgent(agent: Agent): void` — upserts a row in `agent_snapshots`
- Both check for an active Supabase session before attempting to sync; silently no-op if not authenticated or no Supabase config

**New file: `src/lib/useAdminRole.ts`** (React hook)

- Queries `user_roles` for the current user's role on mount
- Returns `{ isAdmin: boolean; loading: boolean }`

**Modified: `src/pages/Dashboard.tsx`**

- Call `syncRoom(room)` after `upsertRoom()` in `CreateRoomDialog`
- Call `syncRoom(room)` when a room card is clicked (open event — updates `last_opened_at`)

**Modified: `src/pages/AgentsPage.tsx`**

- Call `syncAgent(agent)` after `upsertAgent()` in `handleSave`

**Modified: `src/pages/SkillsPage.tsx`**

- Call `syncSkill(skill)` after `upsertSkill()` in `handleWizardSave` and `handleInstall` (optional, lower priority)

**New file: `src/pages/AdminPage.tsx`**

A new page (only visible/accessible to admin users) with:
- A table of all users' rooms: columns = User email, Room title, Goal (truncated), Agents count, Orchestration, Created, Last opened
- A table of all users' agents: columns = User email, Agent name, Role, Domain, Provider/Model, Created
- Filter by user (dropdown of all user emails)
- Simple date range filter
- No links into the actual rooms (just metadata)

**Modified: `src/App.tsx`**

- Add route `/admin` → `<AdminPage />`
- Wrap it in `<ProtectedRoute>` + an additional `AdminRoute` guard that checks `isAdmin`

**Modified: `src/components/AppLayout.tsx`**

- Add "Admin" nav item (with a `ShieldCheck` icon) that only renders when `isAdmin === true`
- Uses `useAdminRole` hook to conditionally show the link

---

### Security Design

- `has_role()` is a `SECURITY DEFINER` function — it bypasses RLS to check the `user_roles` table without recursion
- Admins are assigned by manually inserting into `user_roles` via the backend SQL editor (or a one-time migration that seeds the first admin by email)
- The `AdminPage` component additionally checks `isAdmin` client-side and redirects non-admins to `/`
- API keys, system prompts, message content, and inner thoughts are **never stored** in any database table

---

### What Regular Users See

Absolutely nothing changes. The sync calls are invisible background operations. The admin nav item does not appear for non-admin users.

---

### Technical Notes

- `room_snapshots.room_id` stores the localStorage UUID as a `text` column (not a foreign key — rooms live in localStorage, not the DB)
- `agent_snapshots.agent_id` similarly stores the local UUID as `text`
- Upserts use `ON CONFLICT (user_id, room_id)` / `ON CONFLICT (user_id, agent_id)` to avoid duplicates
- The admin email for the initial seed will be asked to the user before the migration runs

