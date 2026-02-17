

# Timed Meeting Sessions for Rooms

## Overview

Add a "Meeting Mode" to rooms that lets you schedule timed conversations with a start time, duration, topic, goals, and attached documents. Agents will be time-aware throughout the session and will automatically deliver closing summaries 5 minutes before the meeting ends. Rooms can be triggered for multiple meetings, each stored as a separate session.

---

## Data Model Changes (`src/types/index.ts`)

Add a `MeetingSession` interface and extend `Room` with meeting configuration:

```text
MeetingSession {
  id: string
  roomId: string
  topic: string
  goals: string
  additionalInfo: string
  documents: RoomDocument[]
  startTime: string (ISO)
  durationMinutes: number
  status: 'scheduled' | 'active' | 'wrap-up' | 'ended'
  createdAt: string
}

Room (extended fields):
  meetings: MeetingSession[]  // history of all sessions
  activeMeetingId?: string    // currently running session
```

---

## Storage (`src/lib/store.ts`)

- Add `getMeetingSessions(roomId)` and `saveMeetingSession(session)` helpers using localStorage (key: `br_meetings`).
- Add `getActiveMeeting(roomId)` convenience function.

---

## Meeting Setup UI (`src/pages/RoomView.tsx`)

Add a "Start Meeting" button in the room header that opens a dialog with:

- **Topic** (text input) -- pre-filled from room title
- **Goals** (textarea) -- pre-filled from room goal
- **Additional Information** (textarea) -- free-form context
- **Start Time** -- date/time picker (default: "now")
- **Duration** -- select dropdown (15, 30, 45, 60, 90, 120 min)
- **Documents** -- file upload area (reuses existing upload logic)

The dialog creates a `MeetingSession`, stores it, and sets it as `activeMeetingId` on the room. Previous meetings remain accessible in a "Past Meetings" section.

---

## Meeting Timer & Status Bar (`src/pages/RoomView.tsx`)

When a meeting is active, display a persistent timer bar below the room header showing:

- Meeting topic
- Elapsed time / total duration (e.g., "23:45 / 60:00")
- Time remaining with color coding:
  - Green: > 10 minutes left
  - Yellow: 5-10 minutes left
  - Red: < 5 minutes left (wrap-up phase)
- A "End Meeting" button

Use a `useEffect` with a 1-second interval to update the timer. When remaining time hits 5 minutes, set meeting status to `wrap-up`.

---

## Time-Aware Agent Prompts (`src/lib/llm.ts`)

Modify `buildSystemMessage` and `callAgent` to accept an optional meeting context:

- Inject meeting metadata into the system prompt:
  ```
  --- MEETING CONTEXT ---
  Topic: [topic]
  Goals: [goals]
  Additional Info: [additionalInfo]
  Time Remaining: [X] minutes of [Y] total
  Phase: [active / wrap-up]
  --- END MEETING CONTEXT ---
  ```

- During **active phase**: append instruction like "You have [X] minutes remaining. Structure your arguments accordingly -- be thorough but mindful of time."

- During **wrap-up phase** (last 5 minutes): append instruction like "The meeting ends in [X] minutes. Focus on summarizing your position and key takeaways rather than introducing new arguments."

The `callAgent` function signature will accept an optional `meetingContext` parameter, and `RoomView` will compute and pass it on each agent call.

---

## Auto-Summary at Wrap-Up (`src/pages/RoomView.tsx`)

When the timer enters wrap-up phase (5 min remaining):

1. Insert a system message: "Meeting entering final phase -- 5 minutes remaining. Each agent will now summarize their position."
2. Automatically trigger each agent in sequence to deliver a closing summary. The prompt override for this final round:
   ```
   The meeting is ending. Provide your CLOSING SUMMARY:
   1. Your key position and conclusions on the topic
   2. Points of agreement/disagreement with other agents
   3. Recommended next steps from your perspective
   
   Draw on your persona, expertise, and memory. Be concise -- this is your final statement.
   ```
3. After all agents have summarized, insert a system message: "Meeting ended" and set meeting status to `ended`.

---

## Re-Triggering Rooms (Multiple Sessions)

- The "Start Meeting" button is always available (not disabled after one meeting).
- Each meeting creates a new `MeetingSession` with its own ID.
- A "Past Meetings" collapsible section in the right panel shows previous sessions with their topic, date, duration, and status.
- Clicking a past meeting could scroll to or filter messages from that session's timeframe (messages have timestamps that can be matched).

---

## Technical Details

### Files to Create
- None (all changes fit in existing files)

### Files to Modify
1. **`src/types/index.ts`** -- Add `MeetingSession` interface, extend `Room`
2. **`src/lib/store.ts`** -- Add meeting session storage helpers
3. **`src/pages/RoomView.tsx`** -- Meeting setup dialog, timer bar, wrap-up auto-trigger logic, past meetings panel
4. **`src/lib/llm.ts`** -- Accept and inject meeting context into agent system prompts
5. **`src/pages/Dashboard.tsx`** -- Show active meeting indicator on room cards

### Key Implementation Considerations
- Timer uses `setInterval(1000)` with cleanup in `useEffect` return
- Meeting context is computed fresh before each `callAgent` call so time remaining is accurate
- Wrap-up auto-summary runs agents sequentially (reusing `triggerAgent` logic) with a modified prompt
- Documents attached during meeting setup are merged into the room's document list
- All meeting data persists in localStorage following existing patterns

