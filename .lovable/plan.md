
## Chat Bubble View Mode — Mockup-Inspired Visualization

### What the Mockup Shows vs. Current UI

The mockup depicts a mobile-first chat room with:
- A horizontal row of circular agent avatars (with name + role below) pinned below the room title
- Full-width colored chat bubbles per agent (solid colored background, not just a border accent)
- Agent name label displayed prominently at the top of each bubble
- User messages as a clean text input at the bottom
- A warmer/lighter background (beige tones)
- No visible right sidebar — agents shown compactly as icons at the top

The current UI uses a card-with-border approach with a right-panel agent roster. The goal is to add a **"Chat Bubble" view mode** as a settings toggle that transforms the room's visual presentation to match the mockup, without removing any functionality.

---

### Implementation Strategy

A new boolean preference (`chatBubbleMode`) will be stored in `localStorage` under app preferences. A toggle will be added to the **Settings page** so users can switch between "Default" and "Chat Bubble" modes globally. The RoomView will read this preference and render accordingly.

---

### Changes Required

**1. `src/lib/store.ts` (or a new `src/lib/appPrefs.ts`)**

Add two small helper functions:
- `getChatBubbleMode(): boolean` — reads from `localStorage`
- `setChatBubbleMode(val: boolean): void` — writes to `localStorage`

**2. `src/pages/SettingsPage.tsx`**

Add a new "Appearance" card section with a toggle labeled **"Chat Bubble View"** (description: "Display room conversations as colored chat bubbles with agent avatars at the top, inspired by mobile messaging apps"). Uses the same `Switch` component pattern already in the file.

**3. `src/pages/RoomView.tsx`**

This is the largest change. Read `getChatBubbleMode()` on mount into a state variable `bubbleMode`. When `bubbleMode` is `true`, alter the rendering of:

**A. Agent avatars bar** — Replace the right sidebar's agent list with a horizontal strip just below the room header. Each agent gets a circular avatar (initial letter on colored background), their name, and their role in a column. Tapping the avatar triggers `triggerAgent`. This row is shown instead of the right panel (the right panel is hidden in bubble mode on all screen sizes, with its useful controls like add/remove agent and Balance slider moved to a settings popover or kept accessible).

**B. Message bubbles** — Instead of `border border-border` cards with subtle background tints, render:
- Agent messages: fully colored background (`hsl(var(--agent-N) / 0.85)`) with white/dark text, rounded corners (more radius), left-aligned with a slight left margin, agent name shown in bold above the bubble content
- User messages: right-aligned, solid secondary/dark background (as current), higher contrast
- System/summarizer messages: centered, muted pill style (as current, already works well)

The bubble container switches from `max-w-[85%]` to `max-w-[80%]` with more pronounced rounded corners (`rounded-2xl`). The agent avatar circle appears to the left of the bubble (inline), similar to messaging apps.

**C. Background** — In bubble mode, apply a warmer background class to the messages area (`bg-amber-50/30 dark:bg-neutral-900`).

**D. Agent panel** — In bubble mode, the right panel (`w-72 flex-col`) is hidden entirely. Its critical controls (add/remove agents, balance slider, documents, past meetings) are preserved in a collapsible drawer/popover triggered by the existing ⚙️ icon in the header.

---

### Detailed File Plan

```text
src/lib/store.ts
  + getChatBubbleMode(): boolean
  + setChatBubbleMode(enabled: boolean): void

src/pages/SettingsPage.tsx
  + import getChatBubbleMode, setChatBubbleMode
  + New "Appearance" card with Switch for Chat Bubble Mode

src/pages/RoomView.tsx
  + import getChatBubbleMode
  + const [bubbleMode, setBubbleMode] = useState(() => getChatBubbleMode())
  
  In bubble mode:
  + Render agent avatar strip below header (horizontal scroll row)
  + Hide right panel entirely
  + Move right-panel controls (add agents, docs, balance, meetings) into a 
    Sheet/Drawer triggered by the existing ⚙️ mobile toggle button
  + Message rendering:
      - agent messages: colored bubble with avatar left, name label above content
      - user messages: right-aligned dark bubble
      - system/summarizer: centered pill (unchanged)
  + Warmer background for message area
```

---

### Technical Details

**Agent avatar strip (bubble mode only):**
```text
[horizontal scrollable row, sticky below header]
  For each roomAgent:
    [clickable column]
      [circle: colorIndex bg, initial letter, 40x40px]
      [name: truncated, 10px]
      [role: truncated, 9px, muted]
      [loading pulse if this agent is loadingAgentId]
```

**Message bubble rendering (bubble mode):**
```text
Agent message:
  [flex row, gap-2, align-start]
    [circle avatar 28x28px, agent color]
    [flex col]
      [agent name, bold, 11px, agent color]
      [bubble div: rounded-2xl px-4 py-3, bg agent color at 0.15 opacity,
       border agent color at 0.35, text foreground]
      [footer: timestamp, provider badge, model — same as current]

User message:
  [flex row, justify-end]
    [bubble div: rounded-2xl px-4 py-3, bg secondary, text secondary-foreground]
    [timestamp below, right-aligned]
```

**Right panel controls in bubble mode:**
The existing `showAgentPanel` mobile-toggle button (⚙️ in header) will open a Sheet (side drawer) containing all the right-panel content: agent roster with add/remove, documents, balance slider, past meetings. This means zero functionality is lost.

---

### What Does NOT Change

- All agent triggering, auto-orchestration, summarizer, meetings, and message sending logic remain completely untouched
- The right panel remains fully visible and functional in the default (non-bubble) mode
- Provider badges, token counts, latency info, inner thoughts, code blocks — all preserved in both modes
- The toggle in Settings is a global preference, applied consistently across all rooms
