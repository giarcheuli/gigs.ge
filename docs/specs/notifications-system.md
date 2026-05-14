# Notifications System

Users receive inbox notifications when events occur on their account, such as when someone applies for their posted gig.

## Architecture

### Backend (API)

The notifications system is built on:
- **Table**: `notifications` in PostgreSQL with fields:
  - `id`: UUID primary key
  - `recipientId`: UUID foreign key to users table
  - `type`: TEXT enum-like field (e.g., `'application_submitted'`)
  - `payload`: JSONB storing event-specific data (e.g., `{ applicationId, gigId, gigName, applicantId }`)
  - `readAt`: timestamp, null when unread
  - `createdAt`: auto-set timestamp

- **Route**: `/api/v1/notifications` (new)
  - `GET /` — Returns unread notifications for current user (newest first)
  - `GET /all` — Returns all notifications, read and unread (newest first)
  - `POST /:id/read` — Marks a specific notification as read
  - `POST /read-all` — Marks all unread notifications as read

### Frontend (Web)

- **Notifications Tab** in `/account` page shows inbox with:
  - Unread badge ("3 unread notifications")
  - "Mark all as read" button (when unread exist)
  - Notification cards with type-specific rendering:
    - `'application_submitted'`: Shows "📋 Someone applied for {gigName}" with link to gig detail
  - Individual mark-as-read icon on each notification (✕ to dismiss/mark read)
  - Timestamp for each notification (formatted as "13 May 2026")

- **Gig Board Enhancement**: Shows "✓ Applied" badge on gigs where user has a pending application
  - Fetches user's applications and renders yellow badge on matching gigs
  - Only visible to verified users

### Trigger: Application Submission

When a worker submits an application to a gig:
1. Application record is created with status `'pending'`
2. Notification is created for the gig poster with:
   - `type: 'application_submitted'`
   - `payload: { applicationId, gigId, gigName, applicantId }`
3. Poster sees "📋 Someone applied for {gig name}" in their inbox

## User Flow

### Gig Poster
1. **Posts a gig** → Waits for applications
2. **Receives notification** → Sees "Someone applied for {gig name}" in Notifications tab
3. **Clicks notification** → Navigates to gig detail page to view applications
4. **Reviews applications** → Can accept/reject from gig detail
5. **Marks as read** → Can dismiss individual notification (✕) or batch mark all as read

### Worker
1. **Applies to a gig** → Application submitted
2. **Sees "✓ Applied" badge** → On gig board next to gig title (if unread applications exist)
3. **Navigates to account** → Can view their submitted applications in "My Work" tab

## Extensibility

To add more notification types:
1. Add new type string to backend trigger logic
2. Extend `Notification` payload interface in frontend
3. Add conditional rendering in `NotificationsTab` component's `renderNotification()` function
4. Update documentation

Examples of future notification types:
- `'application_accepted'` → "Your application for {gig} was accepted!"
- `'application_rejected'` → "Your application for {gig} was declined"
- `'contract_signed'` → "Contract started for {gig}"
- `'contract_completed'` → "Work completed for {gig}"
- `'payment_received'` → "You received payment for {gig}"

## Database Queries

- **Unread count for user**: `SELECT COUNT(*) FROM notifications WHERE recipientId = $1 AND readAt IS NULL`
- **All notifications**: `SELECT * FROM notifications WHERE recipientId = $1 ORDER BY createdAt DESC`
- **Create notification**: Insert with auto-generated `id` and `createdAt`
- **Mark as read**: `UPDATE notifications SET readAt = NOW() WHERE id = $1`
- **Mark all as read for user**: `UPDATE notifications SET readAt = NOW() WHERE recipientId = $1 AND readAt IS NULL`
