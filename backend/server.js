const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { authMiddleware, router: authRouter } = require('./auth');
const roomManager = require('./roomManager');
const setupWebSocket = require('./websocket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use(cors());
app.use(express.json());
app.use(express.static(frontendPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);

app.get('/api/rooms', authMiddleware, (req, res) => {
  res.json({ rooms: roomManager.listRoomsForUser(req.user.username) });
});

app.post('/api/rooms/private', authMiddleware, (req, res) => {
  try {
    const room = roomManager.createPrivateRoom(req.body.name, req.user.username);
    res.status(201).json({ room });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

app.post('/api/rooms/join', authMiddleware, (req, res) => {
  try {
    const room = roomManager.joinRoomWithInvite(req.body.inviteCode, req.user.username);
    res.json({ room });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

app.get('/api/rooms/:roomId/messages', authMiddleware, (req, res) => {
  if (!roomManager.canJoinRoom(req.params.roomId, req.user.username)) {
    return res.status(403).json({ message: 'You are not allowed to view this room.' });
  }

  return res.json({ messages: roomManager.getMessages(req.params.roomId) });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(frontendPath, 'chat.html'));
});

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`ChatApp running at http://localhost:${PORT}`);
});
