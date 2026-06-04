const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const router = express.Router();
const users = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deployment';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateCredentials(username, password) {
  if (normalizeUsername(username).length < 3) {
    return 'Username must be at least 3 characters long.';
  }

  if (String(password || '').length < 6) {
    return 'Password must be at least 6 characters long.';
  }

  return null;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing authentication token.' });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
}

router.post('/register', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');
  const validationError = validateCredentials(username, password);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  if (users.has(username)) {
    return res.status(409).json({ message: 'Username is already registered.' });
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await bcrypt.hash(password, 10)
  };

  users.set(username, user);

  return res.status(201).json({
    token: createToken(user),
    user: { id: user.id, username: user.username }
  });
});

router.post('/login', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');
  const user = users.get(username);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  return res.json({
    token: createToken(user),
    user: { id: user.id, username: user.username }
  });
});

module.exports = {
  authMiddleware,
  router,
  users,
  verifyToken
};
