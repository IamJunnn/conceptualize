Team Todos Implementation Plan
Overview
Build a real-time collaborative todo system for teams using Firestore, with assignee support and full sync across all team members.
1. Firestore Data Structure
firestore/
└── teams/{teamId}/
    └── todos/{todoId}
        ├── id: string
        ├── text: string
        ├── completed: boolean
        ├── priority: 1 | 2 | 3 | 4  (P1=urgent, P2=high, P3=medium, P4=low)
        ├── startDate?: string (YYYY-MM-DD)
        ├── endDate?: string (YYYY-MM-DD)
        ├── description?: string
        ├── assignees: string[]  (array of member emails)
        ├── createdBy: string (email)
        ├── createdAt: Timestamp
        ├── updatedAt: Timestamp
        ├── completedAt?: Timestamp
        ├── completedBy?: string (email)
2. Files to Create
A. Service Layer
File	Purpose
frontend/src/services/teamTodoService.ts	Firestore CRUD operations + real-time listeners
B. Components
File	Purpose
frontend/src/components/Team/TeamTodoPanel.tsx	Main team todos view (replaces NoteTodosView in team mode)
frontend/src/components/Team/TeamTodoPanel.css	Styles
frontend/src/components/Team/TeamTodoItem.tsx	Individual todo item with assignee badges
frontend/src/components/Team/AddTeamTodoModal.tsx	Modal to create/edit team todos
frontend/src/components/Team/AssigneeSelector.tsx	Multi-select dropdown for assigning members
C. Types
File	Purpose
frontend/src/types/teamTodo.ts	TypeScript interfaces
D. Firestore Rules
File	Purpose
firestore.rules	Update security rules for todos subcollection
3. Implementation Details
Phase 1: Types & Service
teamTodo.ts
export interface TeamTodo {
  id: string;
  text: string;
  completed: boolean;
  priority?: 1 | 2 | 3 | 4;
  startDate?: string;
  endDate?: string;
  description?: string;
  assignees: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  completedBy?: string;
}

export interface TeamTodoFormData {
  text: string;
  priority?: number;
  startDate?: string;
  endDate?: string;
  description?: string;
  assignees: string[];
}
teamTodoService.ts
// Core functions:
- createTodo(teamId, todoData, userEmail) → Promise<TeamTodo>
- updateTodo(teamId, todoId, updates) → Promise<void>
- deleteTodo(teamId, todoId) → Promise<void>
- toggleTodo(teamId, todoId, userEmail) → Promise<void>
- getTodos(teamId) → Promise<TeamTodo[]>
- subscribeToTodos(teamId, callback) → Unsubscribe  // Real-time listener
Phase 2: UI Components
TeamTodoPanel.tsx
Header with filters: "All" | "My Tasks" | "Unassigned" | by member
Toggle: Show/Hide completed
List of TeamTodoItem components
Floating "+" button to add new todo
Real-time updates via Firestore listener
TeamTodoItem.tsx
Checkbox for completion
Priority indicator (colored dot)
Title
Due date badge
Assignee avatars (initials)
Click to edit
Context menu: Edit, Delete, Assign
AddTeamTodoModal.tsx
Title input
Priority selector (P1-P4)
Start/End date pickers
Description textarea
AssigneeSelector component
Save/Cancel buttons
AssigneeSelector.tsx
Multi-select dropdown
Shows team members with avatars
Checkboxes to select multiple
"Assign to me" quick button
Phase 3: Integration
TeamMainUI.tsx updates:
Replace NoteTodosView with TeamTodoPanel for team mode
Pass team members to component for assignee selection
Pass current user email for "My Tasks" filter
4. Firestore Security Rules
match /teams/{teamId}/todos/{todoId} {
  // Read: Any team member
  allow read: if isTeamMember(teamId);
  
  // Create: Any team member
  allow create: if isTeamMember(teamId) 
    && request.resource.data.createdBy == request.auth.token.email;
  
  // Update: Creator, assignees, or admin/owner
  allow update: if isTeamMember(teamId) && (
    resource.data.createdBy == request.auth.token.email ||
    request.auth.token.email in resource.data.assignees ||
    isTeamAdmin(teamId)
  );
  
  // Delete: Creator or admin/owner only
  allow delete: if isTeamMember(teamId) && (
    resource.data.createdBy == request.auth.token.email ||
    isTeamAdmin(teamId)
  );
}
5. Features Summary
Feature	Description
Create Todo	Any member can create, auto-set createdBy
Assign	Assign to one or multiple members
My Tasks Filter	Show only todos assigned to current user
Priority	P1 (red), P2 (orange), P3 (yellow), P4 (gray)
Due Dates	Start and end dates with visual indicators
Real-time Sync	All members see updates instantly
Completion Tracking	Records who completed and when
Permissions	Role-based edit/delete permissions
6. UI Mockup
┌─────────────────────────────────────────────────┐
│  Team Todos                        [+ Add Todo] │
├─────────────────────────────────────────────────┤
│  [All] [My Tasks] [Unassigned]   ☑ Show done   │
├─────────────────────────────────────────────────┤
│  ○ ●  Fix login bug                    Dec 15  │
│       👤 John, 👤 Mary                          │
│                                                 │
│  ○ ●  Update dashboard design          Dec 18  │
│       👤 You                                    │
│                                                 │
│  ☑    Setup CI/CD pipeline             Dec 10  │
│       👤 Alex  ✓ Completed by John              │
└─────────────────────────────────────────────────┘
7. Implementation Order
Create types (teamTodo.ts)
Create service (teamTodoService.ts)
Update Firestore rules
Build AssigneeSelector component
Build AddTeamTodoModal component
Build TeamTodoItem component
Build TeamTodoPanel component
Integrate into TeamMainUI
Test real-time sync with multiple users