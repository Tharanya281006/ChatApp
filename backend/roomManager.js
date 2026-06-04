const crypto = require('crypto');

const DEFAULT_GROUPS = [
  { groupId: 'general', groupName: 'General', inviteCode: 'GENERAL', isPublic: true, members: new Set() },
  { groupId: 'tech', groupName: 'Tech', inviteCode: 'TECH', isPublic: true, members: new Set() },
  { groupId: 'random', groupName: 'Random', inviteCode: 'RANDOM', isPublic: true, members: new Set() },
  { groupId: 'projects', groupName: 'Projects', inviteCode: 'PROJECTS', isPublic: true, members: new Set() }
];

const groups = new Map();
const messagesByGroup = new Map();
const onlineConnections = new Map();

DEFAULT_GROUPS.forEach((group) => {
  groups.set(group.groupId, group);
  messagesByGroup.set(group.groupId, []);
});

function createInviteCode() {
  let inviteCode;

  do {
    inviteCode = `CHAT-${crypto.randomInt(1000, 10000)}`;
  } while (findGroupByInviteCode(inviteCode));

  return inviteCode;
}

function toPublicGroup(group, includeMembers = false) {
  return {
    groupId: group.groupId,
    groupName: group.groupName,
    inviteCode: group.inviteCode,
    isPublic: group.isPublic,
    members: includeMembers ? Array.from(group.members) : undefined,
    id: group.groupId,
    name: group.groupName,
    isPrivate: !group.isPublic
  };
}

function listGroupsForUser(username) {
  return Array.from(groups.values())
    .filter((group) => group.isPublic || group.members.has(username))
    .map((group) => toPublicGroup(group));
}

function getGroup(groupId) {
  return groups.get(groupId);
}

function findGroupByInviteCode(inviteCode) {
  const normalizedCode = String(inviteCode || '').trim().toUpperCase();
  return Array.from(groups.values()).find((group) => group.inviteCode === normalizedCode);
}

function isGroupMember(groupId, username) {
  const group = groups.get(groupId);
  return Boolean(group && (group.isPublic || group.members.has(username)));
}

function createGroup(groupName, username) {
  const name = String(groupName || '').trim();

  if (name.length < 2) {
    const error = new Error('Group name must be at least 2 characters long.');
    error.status = 400;
    throw error;
  }

  const group = {
    groupId: crypto.randomUUID(),
    groupName: name,
    inviteCode: createInviteCode(),
    isPublic: false,
    members: new Set([username])
  };

  groups.set(group.groupId, group);
  messagesByGroup.set(group.groupId, []);

  return toPublicGroup(group, true);
}

function joinGroupWithInvite(inviteCode, username) {
  const group = findGroupByInviteCode(inviteCode);

  if (!group) {
    const error = new Error('Invalid invite code');
    error.status = 404;
    throw error;
  }

  group.members.add(username);
  return toPublicGroup(group, true);
}

function getMessages(groupId) {
  return messagesByGroup.get(groupId) || [];
}

function addMessage(groupId, username, messageText) {
  const message = {
    username,
    timestamp: new Date().toISOString(),
    message: String(messageText || '').trim()
  };
  const messages = messagesByGroup.get(groupId) || [];

  messages.push(message);

  if (messages.length > 100) {
    messages.shift();
  }

  messagesByGroup.set(groupId, messages);
  return message;
}

function setUserGroup(connectionId, username, groupId) {
  onlineConnections.set(connectionId, { username, groupId });
}

function removeConnection(connectionId) {
  onlineConnections.delete(connectionId);
}

function getOnlineUsers(groupId) {
  return Array.from(onlineConnections.values())
    .filter((connection) => connection.groupId === groupId)
    .map((connection) => connection.username)
    .filter((username, index, all) => all.indexOf(username) === index)
    .sort((a, b) => a.localeCompare(b));
}

module.exports = {
  addMessage,
  canJoinRoom: isGroupMember,
  createGroup,
  createPrivateRoom: createGroup,
  getGroup,
  getMessages,
  getOnlineUsers,
  getRoom: getGroup,
  isGroupMember,
  joinGroupWithInvite,
  joinRoomWithInvite: joinGroupWithInvite,
  listGroupsForUser,
  listRoomsForUser: listGroupsForUser,
  removeConnection,
  setUserGroup,
  setUserRoom: setUserGroup,
  toPublicGroup,
  toPublicRoom: toPublicGroup
};
