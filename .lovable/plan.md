

# Room UI Redesign — Mockup-Inspired "Pare" Look

## What the mockup shows

The reference images depict a boardroom-style debate UI with these distinct characteristics:

1. **Header bar**: App name left, room title centered, pause/settings/leave-room buttons right. Clean, warm tones.
2. **Left sidebar — Agents panel with Summary tab**: Two tabs ("Agents" / "Summary"). The Agents tab shows large circular avatar icons with colored backgrounds and role subtitles. The Summary tab shows a live orchestrator draft with meeting status, key points, and action items.
3. **Meeting status bar**: "Round 2 of 5 · Time Remaining: 02:30" with "Next Argument: [agent] is currently constructing an argument..." status text.
4. **Chat area**: Warm cream/beige background. Agent messages appear as **colored speech bubbles** (green, brown/maroon, earth tones) with agent name above and timestamp to the right. Each bubble has high border-radius. User messages are styled differently (input bar says "Interact with the board...").
5. **Bottom bar**: Input field with "Interact with the board..." placeholder + send button + "Call to Conclude" / "Pause Debate" action button.
6. **Color palette**: Earth tones — warm cream background, olive/forest green bubbles, warm brown/maroon bubbles, muted stone sidebar. No harsh blues or purples.

## Plan

### 1. Update color palette (warm earth tones)
**File**: `src/index.css`
- Change agent colors to earth tones: olive green, warm brown, terracotta, dusty gold, sage, slate
- Adjust chat background to warm cream (`40 30% 96%`)
- Keep sidebar warm stone tones (already close)

### 2. Restructure Room layout to match mockup
**File**: `src/pages/RoomView.tsx`

**Header**: 
- Move room title to center. Add "Leave Room" button (navigates back). Add pause/settings icon buttons right-aligned.
- Remove orchestration dropdown from header (move to settings or keep as popover).

**Left sidebar (Agents + Summary)**:
- Move agent roster from right panel to a **left sidebar** with two tabs: "Agents" and "Summary".
- Agents tab: Large circular avatars (48-56px) with name and role subtitle below. Styled like the mockup with colored icon backgrounds.
- Summary tab: Shows a live meeting summary draft area (auto-saving text) with current orchestrator notes — objective, key conflict, point summaries, status, action items.

**Meeting status bar** (between header and chat):
- Show "Round X of Y · Time Remaining: MM:SS" prominently centered.
- Below it: "Next Argument: [agent] is currently constructing an argument..." when an agent is loading.

**Chat area**:
- Warm cream background.
- Agent bubbles: Large rounded corners (`rounded-2xl`), colored backgrounds matching agent's earth-tone color. Agent name displayed above the bubble, timestamp to the right.
- User messages: Right-aligned, neutral dark bubble.

**Bottom input bar**:
- Placeholder: "Interact with the board..."
- Add a "Call to Conclude" / "Pause Debate" button next to the send button (maps to existing end-meeting / summarize functionality).

### 3. Relocate right panel contents
- Documents, Tasks, Past Meetings, Balance slider → move into the Summary tab or a collapsible section within the left sidebar.
- Keep the Sheet (mobile drawer) for overflow controls.

### 4. Files to modify
- `src/index.css` — earth-tone agent colors
- `src/pages/RoomView.tsx` — full layout restructure (header, left sidebar with tabs, chat area styling, bottom bar, meeting status bar)

### Technical details

The restructure keeps all existing state management and logic intact. Only the JSX layout and Tailwind classes change. The left sidebar will use the existing `Tabs` component from shadcn. The "Summary" tab content will be a `<Textarea>` bound to a new `summaryDraft` state (persisted in room metadata). The "Round X of Y" display maps to the existing `autoRoundCount`/`maxAutoRounds` state. The "Next Argument" status maps to `loadingAgentId`. Agent colors in `index.css` will shift to HSL values in the green/brown/terracotta range.

