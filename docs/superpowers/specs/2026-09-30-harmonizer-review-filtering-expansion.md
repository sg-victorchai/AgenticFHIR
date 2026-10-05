# Harmonizer Review Filtering & Card Expansion

**Date:** 2026-09-30  
**Scope:** Add patient ID filtering to pending reviews API and implement individual card expand/collapse in the "Pending document reviews" list.

---

## Goals

1. Filter pending document reviews to show only those for the current patient
2. Allow users to expand/collapse individual review cards to see details without leaving the list
3. Enable workflow where users can quickly reference multiple review sessions and choose which one to open for full review

---

## Current State

- API endpoint `/api/persona/DataPipelinePersona/clinical-docs-harmonizer/$missions` returns reviews for all patients (`submittedBy=me`)
- Clicking a review card opens the full review panel and hides the pending reviews list
- No way to collapse a card without navigating away
- Users must leave the list and return to view a different review session

---

## Proposed Changes

### 1. API Service Layer (`harmonizerReviewService.ts`)

**Change:** Update `getPendingMissions()` to accept and use patient ID parameter.

```typescript
// Before
async getPendingMissions(): Promise<HarmonizerPendingMission[]>

// After
async getPendingMissions(patientId: string): Promise<HarmonizerPendingMission[]>
```

**URL Change:**
- Before: `?status=awaiting_review&submittedBy=me&_count=100&_offset=0`
- After: `?status=awaiting_review&submittedBy=me&_count=100&_offset=0&patient={patientId}`

---

### 2. Component State (`PatientRecordsPage.tsx`)

**Add new state:**
- `expandedMissionIds` — Set or object tracking which mission IDs are currently expanded
- Initialize as empty (all cards start collapsed)

**Add new handler:**
- `toggleMissionExpanded(missionId: string)` — toggles presence in expanded set

**Update function:**
- `loadPendingHarmonizerMissions()` — pass `patientId!` to `harmonizerReviewService.getPendingMissions(patientId!)`

---

### 3. UI Changes

#### Card Header
- Add expand/collapse icon (>) when collapsed, (v) when expanded
- Icon is clickable and calls `toggleMissionExpanded(missionId)`
- Same visual styling as current collapsed state, just with icon added

#### Collapsed Card
```
┌─ Document import ─────────────── [>] ─┐
│ Mission ID                             │
│ Submitted timestamp    Status badge    │
└──────────────────────────────────────┘
```

#### Expanded Card
```
┌─ Document import ─────────────── [v] ─┐
│ Mission ID                             │
│ Submitted timestamp    Status badge    │
├──────────────────────────────────────┤
│ [Mission details: counts, etc.]        │
│ [Action buttons to open review]        │
└──────────────────────────────────────┘
```

---

### 4. Behavior

- Multiple cards can be expanded simultaneously
- Expanding one card does not collapse others
- Clicking a card's "Review" button opens the full review panel (existing behavior preserved)
- Closing review panel returns to list with same expand/collapse states maintained
- No state persistence across page reload (all start collapsed)

---

## Data Flow

```
User clicks expand icon on card
    ↓
toggleMissionExpanded(missionId)
    ↓
expandedMissionIds state updated
    ↓
Card re-renders with expanded content
    ↓
User can click Review button to open full panel
    ↓
Review panel opens, card state preserved
```

---

## Files to Modify

1. **`src/services/harmonizerReviewService.ts`**
   - Update `getPendingMissions()` signature and URL construction

2. **`src/pages/PatientRecordsPage.tsx`**
   - Add `expandedMissionIds` state
   - Add `toggleMissionExpanded()` handler
   - Update `loadPendingHarmonizerMissions()` to pass `patientId`
   - Update mission card rendering to show/hide details based on expanded state
   - Add expand/collapse icon to card header

---

## Testing Considerations

- Verify API call includes patient parameter and filters correctly
- Verify expand/collapse icon click toggles card state
- Verify multiple cards can be expanded simultaneously
- Verify clicking Review button on expanded card opens full review panel
- Verify card state is lost on page reload (expected behavior)
- Verify existing review workflow is not broken

---

## Success Criteria

✓ API calls include `&patient={patientId}` parameter  
✓ Each review card has clickable expand/collapse icon  
✓ Expanded cards show additional details (mission counts, etc.)  
✓ Multiple cards can be expanded at once  
✓ Users can reference multiple review sessions without leaving the list  
✓ Review panel opens from expanded card without side effects  

