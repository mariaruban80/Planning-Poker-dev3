// === socket.js ===
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

// Module state
let socket = null;
let selectedStoryIndex = null;
let roomId = null;
let userName = null;
let initialVotingSystemReceived = false;
let lastVotingSystem = null;
let reconnectionAttempts = 0;

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
  
  // Initialize socket connection
  socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
    query: { roomId: roomIdentifier, userName: userNameValue }
  });

  // Socket event handlers
  socket.on('connect', () => {
    console.log('[SOCKET] Connected to server with ID:', socket.id);
    socket.emit('joinRoom', { roomId: roomIdentifier, userName: userNameValue });
    
    // Reset reconnection attempts on successful connection
    reconnectionAttempts = 0;
    
    // After connection is established and stable, request vote restoration and voting system
    setTimeout(() => {
      if (socket.connected) {
        console.log('[SOCKET] Requesting data after connection');
        requestUserVoteRestore();
        requestVotingSystem();
        
        // Also request synchronization of all votes
        if (typeof syncAllVotes === 'function') {
          syncAllVotes();
        }
      }
    }, 1000);
    
    handleMessage({ type: 'connect' });
  });

  socket.on('userList', (users) => {
    handleMessage({ type: 'userList', users });
  });

  socket.on('addTicket', ({ ticketData }) => {
    console.log('[SOCKET] Received new ticket from another user:', ticketData);
    handleMessage({ type: 'addTicket', ticketData });
  });

  socket.on('allTickets', ({ tickets }) => {
    console.log('[SOCKET] Received all tickets:', tickets?.length);
    handleMessage({ type: 'allTickets', tickets });
  });

  socket.on('votingSystemUpdate', data => {
    console.log('[SOCKET] Received voting system update:', data.votingSystem);
    
    // Store in session for persistence
    if (data.votingSystem) {
      sessionStorage.setItem('votingSystem', data.votingSystem);
    
      // Only update if different to avoid UI flickering
      if (lastVotingSystem !== data.votingSystem) {
        lastVotingSystem = data.votingSystem;
        initialVotingSystemReceived = true;
        handleMessage({ type: 'votingSystemUpdate', ...data });
      }
    }
  });

  socket.on('syncCSVData', (csvData) => {
    console.log('[SOCKET] Received CSV data:', Array.isArray(csvData) ? csvData.length : 'invalid', 'rows');
    handleMessage({ type: 'syncCSVData', csvData });
    
    // Notify server that CSV data is loaded
    setTimeout(() => {
      console.log('[SOCKET] Notifying server that CSV data is loaded');
      socket.emit('csvDataLoaded');
      
      // Also request voting system after CSV load
      requestVotingSystem();
    }, 300);
  });

  socket.on('storySelected', ({ storyIndex }) => {
    console.log('[SOCKET] Story selected event received:', storyIndex);
    selectedStoryIndex = storyIndex;
    handleMessage({ type: 'storySelected', storyIndex });
    
    // Request votes for this story after receiving story selection
    setTimeout(() => {
      if (socket.connected) {
        requestStoryVotes(storyIndex);
      }
    }, 300);
  });

  socket.on('voteUpdate', ({ userId, vote, storyIndex }) => {
    console.log('[SOCKET] Vote update received for user', userId, 'on story', storyIndex);
    
    // Immediately request full vote synchronization to ensure everyone has the latest state
    if (selectedStoryIndex === parseInt(storyIndex)) {
      setTimeout(() => {
        if (socket.connected) {
          socket.emit('requestStoryVotes', { storyIndex });
        }
      }, 300);
    }
    
    handleMessage({ type: 'voteUpdate', userId, vote, storyIndex });
  });

  socket.on('storyVotes', ({ storyIndex, votes }) => {
    console.log('[SOCKET] Received votes for story', storyIndex, ':', Object.keys(votes || {}).length, 'votes');
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

  socket.on('restoreUserVotes', ({ userVotes }) => {
    console.log('[SOCKET] Received restored votes for user:', Object.keys(userVotes || {}).length, 'stories');
    handleMessage({ type: 'restoreUserVotes', userVotes });
  });

  socket.on('exportData', (data) => {
    console.log('[SOCKET] Received export data with', 
      data?.stories ? data.stories.length : 0, 'stories and',
      data?.votes ? Object.keys(data.votes).length : 0, 'vote sets');
    handleMessage({ type: 'exportData', data });
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] Disconnected from server');
    handleMessage({ type: 'disconnect' });
    
    // Attempt to reconnect automatically
    if (reconnectionAttempts < 5) {
      reconnectionAttempts++;
      setTimeout(() => {
        console.log(`[SOCKET] Attempting reconnection #${reconnectionAttempts}...`);
        reconnect();
      }, 2000);
    }
  });

  socket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error);
    handleMessage({ type: 'error', error });
  });

  socket.on('error', (error) => {
    console.error('[SOCKET] Socket error:', error);
    handleMessage({ type: 'error', error });
  });

  // Return socket for external operations if needed
  return socket;
}

/**
 * Request the current voting system from the server
 */
export function requestVotingSystem() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting voting system configuration');
    socket.emit('requestVotingSystem');
  }
}

/**
 * Check if initial voting system was received
 * @returns {boolean} - Whether the voting system was received
 */
export function hasReceivedVotingSystem() {
  return initialVotingSystemReceived;
}

/**
 * Get the currently selected voting system
 * @returns {string} - The current voting system
 */
export function getCurrentVotingSystem() {
  return lastVotingSystem || sessionStorage.getItem('votingSystem') || 'fibonacci';
}

/**
 * Force synchronization of all votes from server
 */
export function syncAllVotes() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting synchronization of all votes');
    socket.emit('syncAllVotes');
  }
}

/**
 * Request restoration of user votes from server
 */
export function requestUserVoteRestore() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting to restore user votes');
    socket.emit('requestUserVoteRestore');
  }
}

/**
 * Send CSV data to server for synchronization
 * @param {Array} data - CSV data to synchronize
 */
export function emitCSVData(data) {
  if (socket && socket.connected) {
    console.log('[SOCKET] Sending CSV data:', data?.length, 'rows');
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
    
    // After selecting a story, request votes for it
    setTimeout(() => {
      requestStoryVotes(index);
    }, 300);
  }
}

/**
 * Cast a vote for a story
 * @param {string} vote - The vote value
 * @param {string} targetUserId - The user ID receiving the vote
 */
export function emitVote(vote, targetUserId) {
  if (socket && socket.connected) {
    console.log('[SOCKET] Casting vote for user', targetUserId);
    socket.emit('castVote', { vote, targetUserId });
  }
}

/**
 * Request votes for a specific story
 * @param {number} storyIndex - Index of the story
 */
export function requestStoryVotes(storyIndex) {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting votes for story:', storyIndex);
    socket.emit('requestStoryVotes', { storyIndex });
  }
}

/**
 * Reveal votes for the current story
 * Triggers server to broadcast vote values to all clients
 */
export function revealVotes() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting to reveal votes');
    socket.emit('revealVotes');
  }
}

/**
 * Reset votes for the current story
 * Clears all votes and resets the reveal state
 */
export function resetVotes() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting to reset votes');
    socket.emit('resetVotes');
  }
}

/**
 * Request export of all votes data
 */
export function requestExport() {
  if (socket && socket.connected) {
    console.log('[SOCKET] Requesting vote data export');
    socket.emit('exportVotes');
  }
}

/**
 * Add a new ticket and sync with other users
 * @param {Object} ticketData - The ticket data {id, text}
 */
export function emitAddTicket(ticketData) {
  if (socket && socket.connected) {
    console.log('[SOCKET] Adding new ticket:', ticketData);
    socket.emit('addTicket', ticketData);
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
 * Check if socket is connected
 * @returns {boolean} - Connection status
 */
export function isConnected() {
  return socket && socket.connected;
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
 * Refresh voting system and ensure it's properly set
 */
export function refreshVotingSystem() {
  // First try from session storage
  const storedSystem = sessionStorage.getItem('votingSystem');
  if (storedSystem) {
    lastVotingSystem = storedSystem;
  }
  
  // Then request from server
  requestVotingSystem();
}
