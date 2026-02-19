
# Fix Model Policy: Delete Error + Global Enforcement

## Problem Analysis

### Bug 1: DELETE request fails silently
In `AdminPage.tsx`, the `toggleModel` function calls `fetch` with `DELETE` but never checks if the response was successful before updating local state. When you try to disable/un-allow a model, the `DELETE` call to the edge function receives no error handling (the network log shows `Error: Failed to fetch`). Meanwhile the local React state still removes the item, causing a desync on the next render. The fix needs to:
- Add proper error checking (`if (!res.ok) throw new Error(...)`) to the DELETE branch, mirroring what's already done in the POST branch.
- Re-fetch (or restore) the policy from the server after any failure so state is consistent.

### Bug 2: Policy not enforced everywhere
Policy enforcement via `filterModelsByPolicy` is only implemented inside `AgentEditor` in `AgentsPage.tsx`. Three other model pickers are **unconstrained**:

1. **RoomView summarizer popover** (`src/pages/RoomView.tsx`, ~line 1261) — defines its own `PROVIDER_DEFAULT_MODELS` array and renders all models with no policy check. It also doesn't fetch the policy or know about the user's admin status.

2. **PersonaGenerator — Lovable models** (`src/pages/AgentsPage.tsx`, ~line 869) — renders `LOVABLE_MODELS` without filtering, even though the policy may restrict some Lovable models.

3. **PersonaGenerator — non-Lovable providers** (`src/pages/AgentsPage.tsx`, ~line 875) — renders a free-text `<Input>` for non-Lovable providers, bypassing preset restrictions entirely. Should use a filtered dropdown like `AgentEditor` does.

## Solution

### File 1: `src/pages/AdminPage.tsx` — Fix the DELETE error

In the `toggleModel` function, add error checking after the DELETE fetch call (mirrors the POST pattern):

```typescript
// BEFORE (broken — no error check):
await fetch(`${supabaseUrl}/functions/v1/model-policy`, {
  method: 'DELETE',
  ...
});
setModelPolicy(prev => prev.filter(...)); // runs even on failure

// AFTER (fixed):
const res = await fetch(`${supabaseUrl}/functions/v1/model-policy`, {
  method: 'DELETE',
  ...
});
if (!res.ok) {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error ?? 'Failed to remove model from policy');
}
setModelPolicy(prev => prev.filter(...)); // only runs on success
```

### File 2: `src/pages/RoomView.tsx` — Enforce policy on summarizer model selector

**Changes needed:**
1. Import `fetchModelPolicy`, `filterModelsByPolicy` from `@/lib/modelPolicy`.
2. Import `useAdminRole` from `@/lib/useAdminRole`.
3. Add state: `const [modelPolicy, setModelPolicy] = useState<AllowedModel[]>([])`.
4. Add a `useEffect` that loads the policy once on mount using `fetchModelPolicy()`.
5. In the summarizer popover (around line 1262), filter `PROVIDER_DEFAULT_MODELS[provider]` through `filterModelsByPolicy` before rendering — admins bypass the filter.

The `PROVIDER_DEFAULT_MODELS` object in RoomView will be filtered per-provider using the same utility already used in `AgentEditor`.

### File 3: `src/pages/AgentsPage.tsx` — Enforce policy in PersonaGenerator

**Changes needed in `PersonaGenerator`:**
1. Pass `policy` and `isAdmin` as props to `PersonaGenerator` (or fetch them inside the component — fetching inside is cleaner since it already fetches other state).
2. Actually, the cleanest approach: accept `policy: AllowedModel[]` and `isAdmin: boolean` as props from `AgentsPage`, which already has these available in its scope.
3. For the **Lovable model selector**: wrap `LOVABLE_MODELS` with `filterModelsByPolicy('lovable', LOVABLE_MODELS, policy)` (admins bypass).
4. For the **non-Lovable provider selector**: replace the free-text `<Input>` with a filtered `<Select>` using `PROVIDER_PRESET_MODELS[provider]` filtered through the policy, falling back to the text input only for ollama/custom. This matches the behavior in `AgentEditor`.

## Implementation Steps

### Step 1 — Fix `AdminPage.tsx`
- In `toggleModel`, add `res` variable for the DELETE fetch, then check `res.ok` before updating state.

### Step 2 — Fix `RoomView.tsx`
- Add imports for `fetchModelPolicy`, `filterModelsByPolicy`, `AllowedModel`, `useAdminRole`.
- Add `modelPolicy` state and a mount effect to hydrate it.
- In the summarizer popover's model `<Select>`, apply `filterModelsByPolicy` on `modelOptions` before rendering if the user is not an admin.

### Step 3 — Fix `AgentsPage.tsx` (PersonaGenerator)
- Add `policy` and `isAdmin` props to `PersonaGenerator`.
- Pass the already-available `policy` and `isAdmin` values when rendering `<PersonaGenerator>`.
- Filter `LOVABLE_MODELS` through `filterModelsByPolicy` in the Lovable model dropdown.
- Replace the non-Lovable free-text input with a filtered preset dropdown (using `PROVIDER_PRESET_MODELS`), keeping the raw input only for `ollama` and `custom` providers.

## Summary of Changes

```text
src/pages/AdminPage.tsx
  - toggleModel(): add error check on DELETE response

src/pages/RoomView.tsx
  - Add imports: fetchModelPolicy, filterModelsByPolicy, AllowedModel, useAdminRole
  - Add modelPolicy state + useEffect to fetch on mount
  - Filter summarizer model options by policy (non-admins)

src/pages/AgentsPage.tsx
  - PersonaGenerator: add policy + isAdmin props
  - Filter LOVABLE_MODELS in Lovable model selector
  - Replace non-Lovable free text input with filtered preset Select dropdown
  - Pass policy + isAdmin when rendering <PersonaGenerator>
```

No database migrations, no new edge functions, and no new secrets are needed — this is purely a frontend enforcement fix.
