// === socket.js ===
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

let socket = null;
let selectedStoryIndex = null;
let roomId = null;
let userName = null;

const maxReconnectAttempts = 10;
let reconnectAttempts = 0;
let pingInterval = null;
let savedVotingSystem = null;
let lastPongTime = Date.now();
let connectionMonitorInterval = null;

/**
 * Exported utility to get the currently selected story ID from the DOM
 */
export function getCurrentStoryId() {
  const selected = document.querySelector('.story-card.selected');
  return selected?.id || null;
}

/**
 * Initialize WebSocket connection to server
 */
export function initializeWebSocket(roomIdentifier, userNameValue, handleMessage) {
  if (!userNameValue) {
    console.error('[SOCKET] Cannot initialize without a username');
    return null;
  }

  roomId = roomIdentifier;
  userName = userNameValue;
  savedVotingSystem = sessionStorage.getItem('votingSystem') || 'fibonacci';

  socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: maxReconnectAttempts,
    reconnectionDelay: 1000,
    timeout: 20000,
    pingTimeout: 30000,
    query: { roomId, userName }
  });

  setupPingPong();
  setupConnectionMonitor(handleMessage);

  socket.on('connect', () => {
    reconnectAttempts = 0;
    socket.emit('joinRoom', { roomId, userName, votingSystem: savedVotingSystem });
    handleMessage({ type: 'connect' });
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    if (pingInterval) clearInterval(pingInterval);
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
    handleMessage({ type: 'disconnect', reason });

    if (['io server disconnect', 'transport close', 'ping timeout'].includes(reason)) {
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        setTimeout(() => { if (!socket.connected) socket.connect(); }, 2000);
      }
    }
  });

  socket.on('connect_error', (error) => {
    reconnectAttempts++;
    handleMessage({ type: 'error', error });
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting');
  });

  socket.on('pong', () => { lastPongTime = Date.now(); });

  // === VOTING AND STORY EVENTS ===
  socket.on('storySelected', ({ storyIndex }) => {
    selectedStoryIndex = storyIndex;
    handleMessage({ type: 'storySelected', storyIndex });
  });

  socket.on('voteUpdate', ({ userId, vote, storyId }) => {
    handleMessage({ type: 'voteUpdate', userId, vote, storyId });
  });

  socket.on('storyVotes', ({ storyId, votes }) => {
    handleMessage({ type: 'storyVotes', storyId, votes: votes || {} });
  });

  socket.on('votesRevealed', ({ storyId }) => {
    handleMessage({ type: 'votesRevealed', storyId });
  });

  socket.on('votesReset', ({ storyId }) => {
    handleMessage({ type: 'votesReset', storyId });
  });

  socket.on('ticketRemoved', ({ storyId }) => {
    handleMessage({ type: 'ticketRemoved', storyId });
  });

  socket.on('addTicket', (data) => {
    if (data && data.ticketData) {
      handleMessage({ type: 'addTicket', ticketData: data.ticketData });
    }
  });

  socket.on('allTickets', ({ tickets }) => {
    handleMessage({ type: 'allTickets', tickets: tickets || [] });
  });

  socket.on('userList', (users) => {
    handleMessage({ type: 'userList', users: users || [] });
  });

  socket.on('votingSystemUpdate', (data) => {
    if (data?.votingSystem) {
      savedVotingSystem = data.votingSystem;
      sessionStorage.setItem('votingSystem', data.votingSystem);
    }
    handleMessage({ type: 'votingSystemUpdate', ...data });
  });

  socket.on('syncCSVData', (csvData) => {
    handleMessage({ type: 'syncCSVData', csvData: Array.isArray(csvData) ? csvData : [] });
    setTimeout(() => socket.emit('csvDataLoaded'), 100);
  });

  socket.on('exportData', (data) => {
    handleMessage({ type: 'exportData', data });
  });

  return socket;
}

/**
 * Emit vote with storyId
 */
export function emitVote(vote, targetUserId) {
  if (!socket?.connected) return;
  const storyId = getCurrentStoryId();
  if (!storyId) return;
  if (targetUserId !== userName) targetUserId = userName;
  socket.emit('castVote', { vote, targetUserId, storyId });
}

/**
 * Reveal votes for current story
 */
export function revealVotes() {
  if (!socket?.connected) return;
  const storyId = getCurrentStoryId();
  if (!storyId) return;
  socket.emit('revealVotes', { storyId });
}

/**
 * Request vote results for current story
 */
export function requestStoryVotes() {
  if (!socket?.connected) return;
  const storyId = getCurrentStoryId();
  if (!storyId) return;
  socket.emit('requestStoryVotes', { storyId });
}

/**
 * Request export of all vote data
 */
export function requestExport() {
  if (!socket?.connected) return;
  socket.emit('exportVotes');
}

/**
 * Ping/pong setup
 */
function setupPingPong() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (socket?.connected) socket.emit('ping');
  }, 20000);
}

/**
 * Monitor stale connection
 */
function setupConnectionMonitor(handleMessage) {
  if (connectionMonitorInterval) clearInterval(connectionMonitorInterval);
  connectionMonitorInterval = setInterval(() => {
    const timeSinceLastPong = Date.now() - lastPongTime;
    if (timeSinceLastPong > 120000) {
      if (socket?.connected) {
        socket.emit('ping');
        setTimeout(() => {
          if (Date.now() - lastPongTime > 130000) {
            if (typeof handleMessage === 'function') handleMessage({ type: 'reconnecting' });
            socket.disconnect().connect();
          }
        }, 10000);
      } else {
        socket.connect();
      }
    }
  }, 30000);
}

/**
 * Get selected story index (optional utility)
 */
export function getCurrentStoryIndex() {
  return selectedStoryIndex;
}

/**
 * Check if connected
 */
export function isConnected() {
  return socket?.connected;
}
