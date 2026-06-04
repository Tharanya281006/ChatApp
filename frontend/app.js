const tokenKey = 'chat_token';
const userKey = 'chat_user';

const state = {
  mode: 'login',
  token: localStorage.getItem(tokenKey),
  user: JSON.parse(localStorage.getItem(userKey) || 'null'),
  socket: null,
  groups: [],
  currentGroupId: null
};

function $(selector) {
  return document.querySelector(selector);
}

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Request failed.');
    }

    return data;
  });
}

function saveSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem(tokenKey, data.token);
  localStorage.setItem(userKey, JSON.stringify(data.user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);

  if (state.socket) {
    state.socket.close();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function showToast(message) {
  const toast = $('#toast');

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function setupLoginPage() {
  const loginTab = $('#loginTab');
  const registerTab = $('#registerTab');
  const authForm = $('#authForm');
  const authButton = $('#authButton');
  const authMessage = $('#authMessage');

  if (!authForm) {
    return;
  }

  if (state.token) {
    window.location.href = '/chat';
    return;
  }

  function setMode(mode) {
    state.mode = mode;
    loginTab.classList.toggle('active', mode === 'login');
    registerTab.classList.toggle('active', mode === 'register');
    authButton.textContent = mode === 'login' ? 'Login' : 'Register';
    authMessage.textContent = '';
  }

  loginTab.addEventListener('click', () => setMode('login'));
  registerTab.addEventListener('click', () => setMode('register'));

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    authMessage.textContent = '';
    authButton.disabled = true;

    try {
      const data = await api(`/api/auth/${state.mode}`, {
        method: 'POST',
        body: JSON.stringify({
          username: $('#username').value,
          password: $('#password').value
        })
      });

      saveSession(data);
      window.location.href = '/chat';
    } catch (error) {
      authMessage.textContent = error.message;
    } finally {
      authButton.disabled = false;
    }
  });
}

function setupChatPage() {
  const groupList = $('#groupList');
  const messageList = $('#messageList');
  const messageInput = $('#messageInput');
  const sendButton = $('#sendButton');

  if (!groupList) {
    return;
  }

  if (!state.token || !state.user) {
    window.location.href = '/login';
    return;
  }

  $('#currentUser').textContent = state.user.username;
  $('#logoutButton').addEventListener('click', () => {
    clearSession();
    window.location.href = '/login';
  });

  function socketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(state.token)}`;
  }

  function sendSocket(event, payload = {}) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      showToast('WebSocket is not connected yet.');
      return;
    }

    state.socket.send(JSON.stringify({ event, payload }));
  }

  function renderGroups() {
    groupList.innerHTML = '';

    state.groups.forEach((group) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `group-button ${group.groupId === state.currentGroupId ? 'active' : ''}`;
      button.innerHTML = `
        <span># ${escapeHtml(group.groupName)}</span>
        ${!group.isPublic ? '<span class="private-pill">Private</span>' : ''}
      `;
      button.addEventListener('click', () => sendSocket('group:join', { groupId: group.groupId }));
      groupList.appendChild(button);
    });
  }

  function renderMessages(messages) {
    messageList.innerHTML = '';
    messages.forEach(renderMessage);
    messageList.scrollTop = messageList.scrollHeight;
  }

  function renderMessage(message) {
    const article = document.createElement('article');
    article.className = 'chat-message';
    article.innerHTML = `
      <div class="message-meta">
        <span class="message-author">${escapeHtml(message.username)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="message-text">${escapeHtml(message.message || message.text)}</div>
    `;
    messageList.appendChild(article);
    messageList.scrollTop = messageList.scrollHeight;
  }

  function renderSystemMessage(message) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = message.text;
    messageList.appendChild(div);
    messageList.scrollTop = messageList.scrollHeight;
  }

  function renderOnlineUsers(users) {
    const onlineUsers = $('#onlineUsers');
    $('#onlineCount').textContent = users.length;
    onlineUsers.innerHTML = '';

    users.forEach((username) => {
      const item = document.createElement('li');
      item.textContent = username;
      onlineUsers.appendChild(item);
    });
  }

  function setCurrentGroup(group, messages, users) {
    state.currentGroupId = group.groupId;
    $('#groupTitle').textContent = `# ${group.groupName}`;
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.placeholder = `Message #${group.groupName}`;

    const inviteBox = $('#inviteBox');
    if (!group.isPublic && group.inviteCode) {
      const link = `${window.location.origin}/chat?invite=${encodeURIComponent(group.inviteCode)}`;
      inviteBox.classList.remove('hidden');
      inviteBox.innerHTML = `Invite code: <strong>${escapeHtml(group.inviteCode)}</strong><br>${escapeHtml(link)}`;
    } else {
      inviteBox.classList.add('hidden');
    }

    renderGroups();
    renderMessages(messages);
    renderOnlineUsers(users);
  }

  function handleSocketPacket(packet) {
    if (packet.event === 'groups:list') {
      state.groups = packet.payload.groups || packet.payload.rooms || [];
      renderGroups();

      const inviteCode = new URLSearchParams(window.location.search).get('invite');
      if (inviteCode) {
        joinInvite(inviteCode);
        window.history.replaceState({}, document.title, '/chat');
        return;
      }

      if (!state.currentGroupId && state.groups.length > 0) {
        sendSocket('group:join', { groupId: state.groups[0].groupId });
      }
      return;
    }

    if (packet.event === 'group:joined') {
      setCurrentGroup(packet.payload.group || packet.payload.room, packet.payload.messages, packet.payload.users);
      return;
    }

    if (packet.event === 'message:new' && packet.payload.groupId === state.currentGroupId) {
      renderMessage(packet.payload.message);
      return;
    }

    if (packet.event === 'system:message' && packet.payload.groupId === state.currentGroupId) {
      renderSystemMessage(packet.payload);
      return;
    }

    if (packet.event === 'users:online' && packet.payload.groupId === state.currentGroupId) {
      renderOnlineUsers(packet.payload.users);
      return;
    }

    if (packet.event === 'error') {
      showToast(packet.payload.message);
    }
  }

  function connectSocket() {
    state.socket = new WebSocket(socketUrl());

    state.socket.addEventListener('open', () => showToast('Connected to chat server.'));
    state.socket.addEventListener('close', () => showToast('Disconnected from chat server.'));
    state.socket.addEventListener('error', () => showToast('Unable to connect to chat server.'));
    state.socket.addEventListener('message', (event) => {
      try {
        handleSocketPacket(JSON.parse(event.data));
      } catch (error) {
        showToast('Received an invalid server message.');
      }
    });
  }

  async function refreshGroups() {
    const data = await api('/api/groups');
    state.groups = data.groups;
    renderGroups();
  }

  async function joinInvite(inviteCode) {
    try {
      const data = await api('/api/groups/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode })
      });

      await refreshGroups();
      sendSocket('group:join', { groupId: data.group.groupId });
      showToast(`Joined ${data.group.groupName}.`);
    } catch (error) {
      showToast(error.message);
    }
  }

  $('#createGroupForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const data = await api('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: $('#privateGroupName').value })
      });

      $('#privateGroupName').value = '';
      await refreshGroups();
      sendSocket('group:join', { groupId: data.group.groupId });
      showToast(`Created group. Invite code: ${data.group.inviteCode}`);
    } catch (error) {
      showToast(error.message);
    }
  });

  $('#inviteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await joinInvite($('#inviteCode').value);
    $('#inviteCode').value = '';
  });

  $('#messageForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();

    if (!text) {
      return;
    }

    sendSocket('message:send', { text });
    messageInput.value = '';
    messageInput.focus();
  });

  connectSocket();
}

setupLoginPage();
setupChatPage();
