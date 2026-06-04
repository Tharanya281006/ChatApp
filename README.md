# ChatApp

A complete full-stack real-time chat application using Node.js, Express, WebSocket (`ws`), JWT authentication, in-memory groups, invite codes, and a vanilla HTML/CSS/JavaScript frontend.

## Features

- Register and login with username + password
- JWT authentication stored in browser `localStorage`
- Express REST API for auth and group invite management
- WebSocket chat connections protected by JWT validation
- Default public groups: General, Tech, Random, Projects
- User-created private groups with unique invite codes like `CHAT-4821`
- Creator is automatically added to the private group members list
- Join private groups by entering a valid invite code
- Access rules: only members can join a private group WebSocket room, receive group messages, and send group messages
- In-memory group messages with `username`, `timestamp`, and `message`
- Online users list updated when users join/leave groups
- Modern Discord-inspired three-panel chat interface

## Required Folder Structure

```text
backend/
  server.js
  auth.js
  websocket.js
  roomManager.js

frontend/
  index.html
  login.html
  chat.html
  style.css
  app.js

package.json
README.md
```

## Requirements

- Node.js 18+
- npm

## Setup

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

Open the application:

```text
http://localhost:3000
```

## Environment Variables

Optional environment variables:

```env
PORT=3000
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1d
```

`JWT_SECRET` should always be changed before deployment.

## How to Use

1. Open `http://localhost:3000`.
2. Click **Login or Register**.
3. Register with a username and password.
4. The app stores the JWT in `localStorage` and redirects you to `/chat`.
5. Select a public group or use the default General group.
6. Send messages in real time.
7. Create a private group from the left sidebar.
8. Share its invite code or invite link with another user.
9. The invited user can paste the invite code or open the invite link to join the private group.
10. Only joined members can open that private group, receive its messages, or send messages to it.

## REST API

### Auth

- `POST /api/auth/register`
  - Body: `{ "username": "alice", "password": "secret123" }`
- `POST /api/auth/login`
  - Body: `{ "username": "alice", "password": "secret123" }`

Both endpoints return:

```json
{
  "token": "jwt-token",
  "user": {
    "id": "user-id",
    "username": "alice"
  }
}
```

### Groups

Group routes require an `Authorization: Bearer <token>` header.

- `GET /api/groups` - List public groups and private groups the current user has joined
- `POST /api/groups` - Create a private group and automatically add the creator as a member
  - Body: `{ "groupName": "Team Group" }`
  - Response includes `groupId`, `groupName`, `inviteCode`, and `members`
- `POST /api/groups/join` - Join a private group using an invite code
  - Body: `{ "inviteCode": "CHAT-4821" }`
  - Invalid codes return `{ "message": "Invalid invite code" }`
- `GET /api/groups/:groupId/messages` - Read in-memory message history for a group the user can access

Backward-compatible `/api/rooms` routes are also present for the existing frontend/room terminology, but new code should use `/api/groups`.

## WebSocket API

The frontend connects to:

```js
const socket = new WebSocket(`ws://localhost:3000/ws?token=${token}`);
```

Client packets use this shape:

```json
{
  "event": "group:join",
  "payload": {
    "groupId": "general"
  }
}
```

Client events:

- `group:join` - Join one group and leave the previous group. Private groups require prior invite-code membership.
- `message:send` - Send a message to the active group. Payload may be `{ "message": "Hello" }` or `{ "text": "Hello" }`.

Server events:

- `groups:list` - Groups visible to the authenticated user
- `group:joined` - Active group details, message history, and online users
- `message:new` - New group message shaped as `{ username, timestamp, message }`
- `system:message` - Join/leave status message
- `users:online` - Updated online users for the group
- `error` - Validation or permission error

## Notes

This project intentionally stores users, groups, online status, and messages in memory. Restarting the server clears all registered users, private groups, and messages. For production, add persistent storage, HTTPS, stricter CORS settings, request rate limiting, and a strong `JWT_SECRET`.
