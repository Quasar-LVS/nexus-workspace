# Nexus — Production Release Checklist

Use this checklist to verify application stability, performance, and functionality before triggering a production release deployment.

---

## 🔒 Authentication & Account Security
- [ ] **Clerk Login Flow**: Verify redirect routes, OAuth login (if active), and credentials verification.
- [ ] **Sign-out Redirect**: Ensure sign-out redirects to the landing page.
- [ ] **Access Enforcement**: Accessing `/dashboard`, `/c/...`, `/p/...` without a session redirects to Clerk sign-in.

## 🏢 Workspace Management
- [ ] **Workspace Creation**: Verify users can create new workspaces with custom slugs.
- [ ] **Workspace Switcher**: Switch between workspaces in the left sidebar without page errors.
- [ ] **Workspace Invitations**: Generate secure invitation codes and verify guest onboarding.

## 💬 Channel & Direct Messaging
- [ ] **Channel Creation**: Setup public and private channels within a workspace.
- [ ] **Messaging Flow**: Verify sending, editing, deleting, and bookmarking messages.
- [ ] **Direct Messages**: Create conversation groups between workspace profiles.
- [ ] **File Attachments**: Upload images and document files within messages and verify downloads.

## 📋 Kanban Projects & Tasks
- [ ] **Project Boards**: Create projects and initialize board columns.
- [ ] **Task Cards**: Seed tasks, update priorities (low, medium, high, urgent), assign teammate profiles, and drag/drop cards.
- [ ] **Task Lifecycle**: Moving tasks across Backlog, Todo, In Progress, Review, and Done columns.

## ⚡ Live WebSockets & Presence
- [ ] **Real-time Synchronization**: Chat messages, task edits, and notifications propagate immediately to other connected users.
- [ ] **Online Presence**: Online indicators display correctly in the left workspace sidebar.
- [ ] **Typing Indicators**: Typing indicators trigger and fade away after typing stops.

## 🔔 Notifications & Alerts
- [ ] **In-App Notifications**: Actions like thread replies, task updates, and mentions generate instant alerts.
- [ ] **Notification Actions**: Clicking an alert navigates directly to the target URL.
- [ ] **Mark Read**: Verify read status updates in database and dropdowns.

## 📈 Analytics & Operational Control
- [ ] **Analytics Views**: Verify charts, active members count, velocity metrics, and AI adoption factors load.
- [ ] **Security Auditing**: Search audit logs by member name, select event filters, and review security indicators.

## 🤖 Nova AI Engine
- [ ] **Nova Chat**: Ask Nova workspace questions and verify streaming chat responses.
- [ ] **Nova Summaries**: Click "Summarize Channel" and review AI standup notes.
- [ ] **Task Generator**: Generate a new project board and tasks from a text description.
- [ ] **Semantic Search**: Verify search queries return matches in messages and tasks.

## 📱 Responsiveness & Accessibility
- [ ] **Mobile Layout**: Layout collapses into a hamburger menu layout on small viewports.
- [ ] **Aria Attributes**: Verify custom icons, dropdown triggers, and modal drawers have descriptive accessibility labels.
- [ ] **Keyboard Controls**: Navigation via tab keys, modal cancellations with Esc, and focus indicators are visible.

## 🛠️ Infrastructure & System Verification
- [ ] **Health Check Endpoint**: `/api/health` returns HTTP 200 and reports statuses for database, storage, auth, and AI.
- [ ] **Type Check Compilation**: `npx tsc --noEmit` compiles cleanly.
- [ ] **Production Build**: `npm run build` succeeds without warnings.
