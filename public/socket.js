// === socket.js ===
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

// Module state
let socket = null;
let selectedStoryIndex = null;
let selectedStoryId = null; // New state to track selected story ID
let roomId = null;
let userName = null;

/**
 * Initialize WebSocket connection to server
 * @param {string} roomIdentifier - ID of the room to join
 * @param {string} userNameValue - Username for the current user
 * @param {Function} handleMessage - Callback to handle incoming messages
 * @returns {Object} - Socket instance for external reference
 */
export function initializeWebSocket(roomIdentifier, userNameValue, handleMessage) {
  // First verify that we have a valid username
  if (!userNameValue) {
    console.error('[SOCKET] Cannot initialize without a username');
    return null;
  }
  
  // Store params for potential reconnection
  roomId = roomIdentifier;
  userName = userNameValue;
  
  // Debug to verify username
  console.log('[SOCKET] Initializing with username:', userName);  
  
  // Initialize socket connection
  socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    query: { roomId: roomIdentifier, userName: userNameValue }
  });
  
  // Socket event handlers
  socket.on('connect', () => {
    console.log('[SOCKET] Connected to server with ID:', socket.id);
    console.log('[SOCKET] Joining room with username:', userNameValue);
    socket.emit('joinRoom', { roomId: roomIdentifier, userName: userNameValue });
    
    // Request current story selection from server after a delay
    setTimeout(() => {
      if (socket && socket.connected) {
        console.log('[SOCKET] Requesting current story selection from server');
        socket.emit('requestCurrentStory');
      }
    }, 1000);
  });

  // Add new event handler for story selection by ID
  socket.on('storySelectedById', ({ storyId, selectorId, selectorName, isInitialSync }) => {
    console.log(`[SOCKET] Story selected by ID: ${storyId}`, 
                selectorId ? `(selected by ${selectorName || selectorId})` : '',
                isInitialSync ? '(initial sync)' : '');
    
    // Store the selected story ID in module state
    selectedStoryId = storyId;
    
    // Pass to the handler with additional information
    handleMessage({
      type: 'storySelectedById',
      storyId,
      selectorId,
      selectorName,
      fromRemote: true,
      isInitialSync: !!isInitialSync
    });
  });

  socket.on('addTicket', ({ ticketData }) => {
    console.log('[SOCKET] Received new ticket from another user:', ticketData);
    handleMessage({ type: 'addTicket', ticketData });
  });

  socket.on('allTickets', ({ tickets }) => {
    console.log('[SOCKET] Received all tickets:', tickets.length);
    // Track what types of tickets we received
    const csvTickets = tickets.filter(t => t.id && t.id.includes('csv')).length;
    const manualTickets = tickets.length - csvTickets;
    console.log(`[SOCKET] Breakdown: ${csvTickets} CSV tickets, ${manualTickets} manual tickets`);     
    handleMessage({ type: 'allTickets', tickets });
  });

  socket.on('userList', (users) => {
    console.log('[SOCKET] Received user list:', users?.length || 0, 'users');
    if (Array.isArray(users) && users.length > 0) {
      console.log('[SOCKET] Users:', users.map(u => `${u.name || 'unnamed'} (${u.id})`).join(', '));
    }
    handleMessage({ type: 'userList', users });
  });

  socket.on('syncCSVData', (csvData) => {
    console.log('[SOCKET] Received CSV data:', Array.isArray(csvData) ? csvData.length : 'invalid', 'rows');
    handleMessage({ type: 'syncCSVData', csvData });
    
    // Notify server that CSV data is loaded
    setTimeout(() => {
      console.log('[SOCKET] Notifying server that CSV data is loaded');
      socket.emit('csvDataLoaded');
    }, 100);
  });

  socket.on('storySelected', ({ storyIndex, storyId, userId, userName, isInitialSync }) => {
    console.log('[SOCKET] Story selection event received:', storyIndex, 
                userId ? `(selected by ${userName || userId})` : '', 
                isInitialSync ? '(initial sync)' : '',
                storyId ? `storyId: ${storyId}` : '');
    
    // Store the selected index in module state
    selectedStoryIndex = storyIndex;
    
    // Also store the story ID if provided (for new ID-based selection)
    if (storyId) {
      selectedStoryId = storyId;
    }
    
    // Pass to the handler with additional information
    handleMessage({ 
      type: 'storySelected', 
      storyIndex, 
      storyId,
      userId,
      userName, 
      fromRemote: true,
      isInitialSync: isInitialSync || false
    });
  });

  socket.on('voteUpdate', ({ userId, vote, storyIndex }) => {
    console.log('[SOCKET] Vote update received for user', userId, 'on story', storyIndex);
    handleMessage({ type: 'voteUpdate', userId, vote, storyIndex });
  });

  socket.on('storyVotes', ({ storyIndex, votes }) => {
    console.log('[SOCKET] Received votes for story', storyIndex, ':', Object.keys(votes).length, 'votes');
    handleMessage({ type: 'storyVotes', storyIndex, votes });
  });

  socket.on('votesRevealed', ({ storyIndex }) => {
    console.log('[SOCKET] Votes revealed for story', storyIndex);
    handleMessage({ type: 'votesRevealed', storyIndex });
  });

  socket.on('votesReset', ({ storyIndex }) => {
    console.log('[SOCKET] Votes reset for story', storyIndex);
    handleMessage({ type: 'votesReset', storyIndex });
  });

  socket.on('revealVotes', (votes) => {
    console.log('[SOCKET] Reveal votes event received (legacy)');
    handleMessage({ type: 'revealVotes', votes });
  });

  socket.on('storyChange', ({ story }) => {
    handleMessage({ type: 'storyChange', story });
  });

  socket.on('storyNavigation', ({ index }) => {
    handleMessage({ type: 'storyNavigation', index });
  });

  socket.on('exportData', (data) => {
    console.log('[SOCKET] Received export data with', 
      data.stories ? data.stories.length : 0, 'stories and',
      data.votes ? Object.keys(data.votes).length : 0, 'vote sets');
    handleMessage({ type: 'exportData', data });
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] Disconnected from server');
    handleMessage({ type: 'disconnect' });
  });

  socket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error);
    handleMessage({ type: 'error', error });
  });

  // Return socket for external operations if needed
  return socket;
}

/**
 * Request user list from server
 */
export function requestUserList() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting user list from server');
    socket.emit('requestUserList');
  }
}

/**
 * Request all tickets from the server
 */
export function requestAllTickets() {
  if (socket) {
    console.log('[SOCKET] Requesting all tickets from server');
    socket.emit('requestAllTickets');
  }
}

/**
 * Request the current story selection from the server
 */
export function requestCurrentStory() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting current story selection');
    socket.emit('requestCurrentStory');
  }
}

/**
 * Send CSV data to server for synchronization
 * @param {Array} data - CSV data to synchronize
 */
export function emitCSVData(data) {
  if (socket) {
    console.log('[SOCKET] Sending CSV data:', data.length, 'rows');
    socket.emit('syncCSVData', data);
  }
}

/**
 * Emit story selection to server
 * @param {number} index - Index of the selected story
 */
export function emitStorySelected(index) {
  if (socket && socket.connected) {
    console.log('[SOCKET] Emitting storySelected:', index);
    socket.emit('storySelected', { storyIndex: index });
    selectedStoryIndex = index;
    return true;
  } else {
    console.warn('[SOCKET] Cannot emit storySelected - socket not connected');
    return false;
  }
}

/**
 * Emit story selection by ID to server
 * @param {string} storyId - ID of the selected story
 * @returns {boolean} - Whether the selection was emitted successfully
 */
export function emitStorySelectedById(storyId) {
  if (socket && socket.connected && storyId) {
    console.log('[SOCKET] Emitting story selection by ID:', storyId);
    socket.emit('storySelectedById', { storyId });
    selectedStoryId = storyId;
    return true;
  } else {
    if (!storyId) {
      console.warn('[SOCKET] Cannot emit storySelectedById - missing ID');
    } else {
      console.warn('[SOCKET] Cannot emit storySelectedById - socket not connected');
    }
    return false;
  }
}

/**
 * Cast a vote for a story
 * @param {string} vote - The vote value
 * @param {string} targetUserId - The user ID receiving the vote
 */
export function emitVote(vote, targetUserId) {
  if (socket) {
    console.log('[SOCKET] Casting vote for user', targetUserId);
    socket.emit('castVote', { vote, targetUserId });
  }
}

/**
 * Request votes for a specific story
 * @param {number} storyIndex - Index of the story
 */
export function requestStoryVotes(storyIndex) {
  if (socket) {
    console.log('[SOCKET] Requesting votes for story:', storyIndex);
    socket.emit('requestStoryVotes', { storyIndex });
  }
}

/**
 * Reveal votes for the current story
 * Triggers server to broadcast vote values to all clients
 */
export function revealVotes() {
  if (socket) {
    console.log('[SOCKET] Requesting to reveal votes');
    socket.emit('revealVotes');
  }
}

/**
 * Reset votes for the current story
 * Clears all votes and resets the reveal state
 */
export function resetVotes() {
  if (socket) {
    console.log('[SOCKET] Requesting to reset votes');
    socket.emit('resetVotes');
  }
}

/**
 * Request export of all votes data
 */
export function requestExport() {
  if (socket) {
    console.log('[SOCKET] Requesting vote data export');
    socket.emit('exportVotes');
  }
}

/**
 * Get the currently selected story index
 * @returns {number|null} - Selected story index or null if none selected
 */
export function getCurrentStoryIndex() {
  return selectedStoryIndex;
}

/**
 * Get the currently selected story ID
 * @returns {string|null} - Selected story ID or null if none selected
 */
export function getSelectedStoryId() {
  return selectedStoryId;
}

/**
 * Check if socket is connected
 * @returns {boolean} - Connection status
 */
export function isConnected() {
  return socket && socket.connected;
}

/**
 * Add a new ticket and sync with other users
 * @param {Object} ticketData - The ticket data {id, text}
 */
export function emitAddTicket(ticketData) {
  if (socket) {
    console.log('[SOCKET] Adding new ticket:', ticketData);
    socket.emit('addTicket', ticketData);
  }
}

/**
 * Force reconnection if disconnected
 * @returns {boolean} - Whether reconnection was attempted
 */
export function reconnect() {
  if (!socket) {
    console.warn('[SOCKET] Cannot reconnect: no socket instance');
    return false;
  }
  
  if (!socket.connected && roomId && userName) {
    console.log('[SOCKET] Attempting to reconnect...');
    socket.connect();
    return true;
  }
  
  return false;
}

/**
 * Debug function to log the current selection state
 * Can be called from console for troubleshooting
 */
export function debugSelectionState() {
  console.log('====== SOCKET SELECTION STATE ======');
  console.log('Selected story index:', selectedStoryIndex);
  console.log('Selected story ID:', selectedStoryId);
  console.log('Room ID:', roomId);
  console.log('Username:', userName);
  console.log('Socket connected:', socket && socket.connected);
  console.log('==================================');
}

// Expose debug function to window for console access
if (typeof window !== 'undefined') {
  window.debugSocketSelection = debugSelectionState;
}
