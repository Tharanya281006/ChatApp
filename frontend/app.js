const tokenKey = 'chat_token';
const userKey = 'chat_user';

const state = {
  mode: 'login',
  token: localStorage.getItem(tokenKey),
  user: JSON.parse(localStorage.getItem(userKey) || 'null'),
  socket: null,
  rooms: [],
  currentRoomId: null
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
  const roomList = $('#roomList');
  const messageList = $('#messageList');
  const messageInput = $('#messageInput');
  const sendButton = $('#sendButton');

  if (!roomList) {
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
  return `wss://chatapp-production-b16a.up.railway.app/ws?token=${encodeURIComponent(state.token)}`;
}

  function sendSocket(event, payload = {}) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      showToast('WebSocket is not connected yet.');
      return;
    }

    state.socket.send(JSON.stringify({ event, payload }));
  }

  function renderRooms() {
    roomList.innerHTML = '';

    state.rooms.forEach((room) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `room-button ${room.id === state.currentRoomId ? 'active' : ''}`;
      button.innerHTML = `
        <span># ${escapeHtml(room.name)}</span>
        ${room.isPrivate ? '<span class="private-pill">Private</span>' : ''}
      `;
      button.addEventListener('click', () => sendSocket('room:join', { roomId: room.id }));
      roomList.appendChild(button);
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
      <div class="message-text">${escapeHtml(message.text)}</div>
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

  function setCurrentRoom(room, messages, users) {
    state.currentRoomId = room.id;
    $('#roomTitle').textContent = `# ${room.name}`;
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.placeholder = `Message #${room.name}`;

    const inviteBox = $('#inviteBox');
    if (room.isPrivate && room.inviteCode) {
      const link = `${window.location.origin}/chat?invite=${encodeURIComponent(room.inviteCode)}`;
      inviteBox.classList.remove('hidden');
      inviteBox.innerHTML = `Invite code: <strong>${escapeHtml(room.inviteCode)}</strong><br>${escapeHtml(link)}`;
    } else {
      inviteBox.classList.add('hidden');
    }

    renderRooms();
    renderMessages(messages);
    renderOnlineUsers(users);
  }

  function handleSocketPacket(packet) {
    if (packet.event === 'rooms:list') {
      state.rooms = packet.payload.rooms;
      renderRooms();

      const inviteCode = new URLSearchParams(window.location.search).get('invite');
      if (inviteCode) {
        joinInvite(inviteCode);
        window.history.replaceState({}, document.title, '/chat');
        return;
      }

      if (!state.currentRoomId && state.rooms.length > 0) {
        sendSocket('room:join', { roomId: state.rooms[0].id });
      }
      return;
    }

    if (packet.event === 'room:joined') {
      setCurrentRoom(packet.payload.room, packet.payload.messages, packet.payload.users);
      return;
    }

    if (packet.event === 'message:new' && packet.payload.roomId === state.currentRoomId) {
      renderMessage(packet.payload.message);
      return;
    }

    if (packet.event === 'system:message' && packet.payload.roomId === state.currentRoomId) {
      renderSystemMessage(packet.payload);
      return;
    }

    if (packet.event === 'users:online' && packet.payload.roomId === state.currentRoomId) {
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

  async function refreshRooms() {
    const data = await api('/api/rooms');
    state.rooms = data.rooms;
    renderRooms();
  }

  async function joinInvite(inviteCode) {
    try {
      const data = await api('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode })
      });

      await refreshRooms();
      sendSocket('room:join', { roomId: data.room.id });
      showToast(`Joined ${data.room.name}.`);
    } catch (error) {
      showToast(error.message);
    }
  }

  $('#createRoomForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const data = await api('/api/rooms/private', {
        method: 'POST',
        body: JSON.stringify({ name: $('#privateRoomName').value })
      });

      $('#privateRoomName').value = '';
      await refreshRooms();
      sendSocket('room:join', { roomId: data.room.id });
      showToast(`Created room. Invite code: ${data.room.inviteCode}`);
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
