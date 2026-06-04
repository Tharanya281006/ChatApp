# ChatApp

A complete full-stack real-time chat application using Node.js, Express, WebSocket (`ws`), JWT authentication, and a vanilla HTML/CSS/JavaScript frontend.

## Features

- Register and login with username + password
- JWT authentication stored in browser `localStorage`
- Express REST API for auth and room/invite management
- WebSocket chat connections protected by JWT validation
- Default chat rooms: General, Tech, Random, Projects
- One active room subscription per WebSocket connection
- Private rooms with unique invite codes and invite links
- In-memory room messages with username, timestamp, and text
- Real-time message broadcasting within the active room
- Online users list updated when users join/leave rooms
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
5. Select a public room or use the default General room.
6. Send messages in real time.
7. Create a private room from the left sidebar.
8. Share its invite code or invite link with another user.
9. The invited user can paste the invite code or open the invite link to join the private room.

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

### Rooms

Room routes require an `Authorization: Bearer <token>` header.

- `GET /api/rooms` - List rooms visible to the current user
- `POST /api/rooms/private` - Create a private room
  - Body: `{ "name": "Team Room" }`
- `POST /api/rooms/join` - Join a private room using an invite code
  - Body: `{ "inviteCode": "A1B2C3D4" }`
- `GET /api/rooms/:roomId/messages` - Read in-memory message history for a room

## WebSocket API

The frontend connects to:

```js
const socket = new WebSocket(`ws://localhost:3000/ws?token=${token}`);
```

Client packets use this shape:

```json
{
  "event": "room:join",
  "payload": {
    "roomId": "general"
  }
}
```

Client events:

- `room:join` - Join one room and leave the previous room
- `message:send` - Send a message to the active room

Server events:

- `rooms:list` - Rooms visible to the authenticated user
- `room:joined` - Active room details, message history, and online users
- `message:new` - New room message
- `system:message` - Join/leave status message
- `users:online` - Updated online users for the room
- `error` - Validation or permission error

## Notes

This project intentionally stores users, rooms, online status, and messages in memory. Restarting the server clears all registered users, private rooms, and messages. For production, add persistent storage, HTTPS, stricter CORS settings, request rate limiting, and a strong `JWT_SECRET`.
