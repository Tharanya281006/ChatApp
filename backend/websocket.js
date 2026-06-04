const crypto = require('crypto');
const WebSocket = require('ws');
const { verifyToken } = require('./auth');
const roomManager = require('./roomManager');

function send(ws, event, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, payload }));
  }
}

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  function broadcastToRoom(roomId, event, payload) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
        send(client, event, payload);
      }
    });
  }

  function broadcastOnlineUsers(roomId) {
    broadcastToRoom(roomId, 'users:online', {
      roomId,
      users: roomManager.getOnlineUsers(roomId)
    });
  }

  function leaveCurrentRoom(ws) {
    if (!ws.roomId) {
      return;
    }

    const oldRoomId = ws.roomId;
    ws.roomId = null;
    roomManager.setUserRoom(ws.id, ws.user.username, null);
    broadcastOnlineUsers(oldRoomId);
  }

  function joinRoom(ws, roomId) {
    if (!roomManager.canJoinRoom(roomId, ws.user.username)) {
      send(ws, 'error', { message: 'You are not allowed to join that room.' });
      return;
    }

    leaveCurrentRoom(ws);
    ws.roomId = roomId;
    roomManager.setUserRoom(ws.id, ws.user.username, roomId);

    const room = roomManager.getRoom(roomId);
    send(ws, 'room:joined', {
      room: roomManager.toPublicRoom(room),
      messages: roomManager.getMessages(roomId),
      users: roomManager.getOnlineUsers(roomId)
    });

    broadcastToRoom(roomId, 'system:message', {
      roomId,
      text: `${ws.user.username} joined ${room.name}.`,
      timestamp: new Date().toISOString()
    });
    broadcastOnlineUsers(roomId);
  }

  function handleChatMessage(ws, payload) {
    const text = String(payload?.text || '').trim();

    if (!ws.roomId) {
      send(ws, 'error', { message: 'Join a room before sending a message.' });
      return;
    }

    if (!text) {
      send(ws, 'error', { message: 'Message cannot be empty.' });
      return;
    }

    if (text.length > 1000) {
      send(ws, 'error', { message: 'Message cannot exceed 1000 characters.' });
      return;
    }

    const message = roomManager.addMessage(ws.roomId, ws.user.username, text);
    broadcastToRoom(ws.roomId, 'message:new', { roomId: ws.roomId, message });
  }

  wss.on('connection', (ws, req) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const token = requestUrl.searchParams.get('token');

    try {
      ws.user = verifyToken(token);
    } catch (error) {
      ws.close(1008, 'Invalid authentication token.');
      return;
    }

    ws.id = crypto.randomUUID();
    ws.roomId = null;
    roomManager.setUserRoom(ws.id, ws.user.username, null);

    send(ws, 'rooms:list', {
      rooms: roomManager.listRoomsForUser(ws.user.username)
    });

    ws.on('message', (rawMessage) => {
      let packet;

      try {
        packet = JSON.parse(rawMessage.toString());
      } catch (error) {
        send(ws, 'error', { message: 'Invalid WebSocket message.' });
        return;
      }

      if (packet.event === 'room:join') {
        joinRoom(ws, packet.payload?.roomId);
        return;
      }

      if (packet.event === 'message:send') {
        handleChatMessage(ws, packet.payload);
      }
    });

    ws.on('close', () => {
      const oldRoomId = ws.roomId;
      roomManager.removeConnection(ws.id);

      if (oldRoomId) {
        broadcastToRoom(oldRoomId, 'system:message', {
          roomId: oldRoomId,
          text: `${ws.user.username} left the room.`,
          timestamp: new Date().toISOString()
        });
        broadcastOnlineUsers(oldRoomId);
      }
    });
  });

  return wss;
}

module.exports = setupWebSocket;
