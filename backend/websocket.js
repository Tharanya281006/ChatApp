const crypto = require('crypto');
const WebSocket = require('ws');
const { verifyToken } = require('./auth');
const groupManager = require('./roomManager');

function send(ws, event, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, payload }));
  }
}

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  function broadcastToGroup(groupId, event, payload) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.groupId === groupId) {
        send(client, event, payload);
      }
    });
  }

  function broadcastOnlineUsers(groupId) {
    broadcastToGroup(groupId, 'users:online', {
      groupId,
      roomId: groupId,
      users: groupManager.getOnlineUsers(groupId)
    });
  }

  function leaveCurrentGroup(ws) {
    if (!ws.groupId) {
      return;
    }

    const oldGroupId = ws.groupId;
    ws.groupId = null;
    ws.roomId = null;
    groupManager.setUserGroup(ws.id, ws.user.username, null);
    broadcastOnlineUsers(oldGroupId);
  }

  function joinGroup(ws, groupId) {
    if (!groupManager.isGroupMember(groupId, ws.user.username)) {
      send(ws, 'error', { message: 'Invalid invite code' });
      return;
    }

    leaveCurrentGroup(ws);
    ws.groupId = groupId;
    ws.roomId = groupId;
    groupManager.setUserGroup(ws.id, ws.user.username, groupId);

    const group = groupManager.getGroup(groupId);
    send(ws, 'group:joined', {
      group: groupManager.toPublicGroup(group, true),
      room: groupManager.toPublicGroup(group, true),
      messages: groupManager.getMessages(groupId),
      users: groupManager.getOnlineUsers(groupId)
    });
    send(ws, 'room:joined', {
      room: groupManager.toPublicGroup(group, true),
      messages: groupManager.getMessages(groupId),
      users: groupManager.getOnlineUsers(groupId)
    });

    broadcastToGroup(groupId, 'system:message', {
      groupId,
      roomId: groupId,
      text: `${ws.user.username} joined ${group.groupName}.`,
      timestamp: new Date().toISOString()
    });
    broadcastOnlineUsers(groupId);
  }

  function handleChatMessage(ws, payload) {
    const messageText = String(payload?.message || payload?.text || '').trim();

    if (!ws.groupId || !groupManager.isGroupMember(ws.groupId, ws.user.username)) {
      send(ws, 'error', { message: 'You must join this group before sending messages.' });
      return;
    }

    if (!messageText) {
      send(ws, 'error', { message: 'Message cannot be empty.' });
      return;
    }

    if (messageText.length > 1000) {
      send(ws, 'error', { message: 'Message cannot exceed 1000 characters.' });
      return;
    }

    const message = groupManager.addMessage(ws.groupId, ws.user.username, messageText);
    broadcastToGroup(ws.groupId, 'message:new', {
      groupId: ws.groupId,
      roomId: ws.groupId,
      message,
      text: message.message
    });
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
    ws.groupId = null;
    ws.roomId = null;
    groupManager.setUserGroup(ws.id, ws.user.username, null);

    const groups = groupManager.listGroupsForUser(ws.user.username);
    send(ws, 'groups:list', { groups, rooms: groups });
    send(ws, 'rooms:list', { groups, rooms: groups });

    ws.on('message', (rawMessage) => {
      let packet;

      try {
        packet = JSON.parse(rawMessage.toString());
      } catch (error) {
        send(ws, 'error', { message: 'Invalid WebSocket message.' });
        return;
      }

      if (packet.event === 'group:join' || packet.event === 'room:join') {
        joinGroup(ws, packet.payload?.groupId || packet.payload?.roomId);
        return;
      }

      if (packet.event === 'message:send') {
        handleChatMessage(ws, packet.payload);
      }
    });

    ws.on('close', () => {
      const oldGroupId = ws.groupId;
      groupManager.removeConnection(ws.id);

      if (oldGroupId) {
        broadcastToGroup(oldGroupId, 'system:message', {
          groupId: oldGroupId,
          roomId: oldGroupId,
          text: `${ws.user.username} left the group.`,
          timestamp: new Date().toISOString()
        });
        broadcastOnlineUsers(oldGroupId);
      }
    });
  });

  return wss;
}

module.exports = setupWebSocket;
