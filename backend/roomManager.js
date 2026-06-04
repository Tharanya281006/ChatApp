const crypto = require('crypto');

const DEFAULT_ROOMS = [
  { id: 'general', name: 'General', isPrivate: false, inviteCode: null, members: new Set() },
  { id: 'tech', name: 'Tech', isPrivate: false, inviteCode: null, members: new Set() },
  { id: 'random', name: 'Random', isPrivate: false, inviteCode: null, members: new Set() },
  { id: 'projects', name: 'Projects', isPrivate: false, inviteCode: null, members: new Set() }
];

const rooms = new Map();
const messagesByRoom = new Map();
const onlineConnections = new Map();

DEFAULT_ROOMS.forEach((room) => {
  rooms.set(room.id, room);
  messagesByRoom.set(room.id, []);
});

function toPublicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    isPrivate: room.isPrivate,
    inviteCode: room.inviteCode
  };
}

function listRoomsForUser(username) {
  return Array.from(rooms.values())
    .filter((room) => !room.isPrivate || room.members.has(username))
    .map(toPublicRoom);
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function canJoinRoom(roomId, username) {
  const room = rooms.get(roomId);
  return Boolean(room && (!room.isPrivate || room.members.has(username)));
}

function createPrivateRoom(roomName, username) {
  const name = String(roomName || '').trim();

  if (name.length < 2) {
    const error = new Error('Room name must be at least 2 characters long.');
    error.status = 400;
    throw error;
  }

  const room = {
    id: crypto.randomUUID(),
    name,
    isPrivate: true,
    inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
    members: new Set([username])
  };

  rooms.set(room.id, room);
  messagesByRoom.set(room.id, []);

  return toPublicRoom(room);
}

function joinRoomWithInvite(inviteCode, username) {
  const normalizedCode = String(inviteCode || '').trim().toUpperCase();
  const room = Array.from(rooms.values()).find(
    (candidate) => candidate.isPrivate && candidate.inviteCode === normalizedCode
  );

  if (!room) {
    const error = new Error('Invalid invite code.');
    error.status = 404;
    throw error;
  }

  room.members.add(username);
  return toPublicRoom(room);
}

function getMessages(roomId) {
  return messagesByRoom.get(roomId) || [];
}

function addMessage(roomId, username, text) {
  const message = {
    username,
    text: String(text || '').trim(),
    timestamp: new Date().toISOString()
  };
  const messages = messagesByRoom.get(roomId) || [];

  messages.push(message);

  if (messages.length > 100) {
    messages.shift();
  }

  messagesByRoom.set(roomId, messages);
  return message;
}

function setUserRoom(connectionId, username, roomId) {
  onlineConnections.set(connectionId, { username, roomId });
}

function removeConnection(connectionId) {
  onlineConnections.delete(connectionId);
}

function getConnection(connectionId) {
  return onlineConnections.get(connectionId);
}

function getOnlineUsers(roomId) {
  return Array.from(onlineConnections.values())
    .filter((connection) => connection.roomId === roomId)
    .map((connection) => connection.username)
    .filter((username, index, all) => all.indexOf(username) === index)
    .sort((a, b) => a.localeCompare(b));
}

module.exports = {
  addMessage,
  canJoinRoom,
  createPrivateRoom,
  getConnection,
  getMessages,
  getOnlineUsers,
  getRoom,
  joinRoomWithInvite,
  listRoomsForUser,
  removeConnection,
  setUserRoom,
  toPublicRoom
};
