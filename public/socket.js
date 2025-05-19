// === socket.js ===
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

// Module state
let socket = null;
let selectedStoryIndex = null;
let roomId = null;
let userName = null;

// Connection reliability enhancements
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let pingInterval = null;
let savedVotingSystem = null;
let lastPongTime = Date.now();
let connectionMonitorInterval = null;

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
  
  // Remember voting system preference for reconnection
  savedVotingSystem = sessionStorage.getItem('votingSystem') || 'fibonacci';
  
  // Initialize socket connection with improved reliability settings
  socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: maxReconnectAttempts,
    reconnectionDelay: 1000,
    timeout: 20000, // Increased timeout
    pingTimeout: 30000, // Increased ping timeout
    query: { roomId: roomIdentifier, userName: userNameValue }
  });

  // Setup ping/pong to keep connection alive
  setupPingPong();
  
  // Monitor connection health
  setupConnectionMonitor(handleMessage);

  // Socket event handlers
  socket.on('connect', () => {
    console.log('[SOCKET] Connected to server with ID:', socket.id);
    
    // Reset reconnect attempts on successful connection
    reconnectAttempts = 0;
    
    // Join room with voting system preference
    socket.emit('joinRoom', { 
      roomId: roomIdentifier, 
      userName: userNameValue,
      votingSystem: savedVotingSystem
    });
    
    // Notify handler about connection
    handleMessage({ type: 'connect' });
    
    // Update connection status indicator if exists
    if (typeof updateConnectionStatus === 'function') {
      updateConnectionStatus('connected');
    }
  });

  // Handle received ticket data events
  socket.on('addTicket', (data) => {
    console.log('[SOCKET] Received addTicket event:', data);
    // Ensure consistent data format for message handler
    if (data && data.ticketData) {
      handleMessage({ type: 'addTicket', ticketData: data.ticketData });
    } else {
      console.warn('[SOCKET] Received malformed addTicket data:', data);
    }
  });

  socket.on('ticketRemoved', ({ storyId }) => {
    console.log('[SOCKET] Ticket removed received from server:', storyId);
    handleMessage({ type: 'ticketRemoved', storyId });
  });

  socket.on('allTickets', ({ tickets }) => {
    console.log('[SOCKET] Received all tickets:', tickets?.length || 0);
    handleMessage({ type: 'allTickets', tickets: tickets || [] });
  });

  socket.on('userList', (users) => {
    handleMessage({ type: 'userList', users: users || [] });
  });
  
  // Handle voting system updates
  socket.on('votingSystemUpdate', data => {
    console.log('[SOCKET] votingSystemUpdate received:', data);
    // Store in session storage for reconnection
    if (data && data.votingSystem) {
      savedVotingSystem = data.votingSystem;
      sessionStorage.setItem('votingSystem', data.votingSystem);
    }
    handleMessage({ type: 'votingSystemUpdate', ...data });
  });

  socket.on('syncCSVData', (csvData) => {
    console.log('[SOCKET] Received CSV data:', Array.isArray(csvData) ? csvData.length : 'invalid', 'rows');
    handleMessage({ type: 'syncCSVData', csvData: Array.isArray(csvData) ? csvData : [] });
    
    // Notify server that CSV data is loaded
    setTimeout(() => {
      console.log('[SOCKET] Notifying server that CSV data is loaded');
      socket.emit('csvDataLoaded');
    }, 100);
  });

  socket.on('storySelected', ({ storyIndex }) => {
    console.log('[SOCKET] Story selected event received:', storyIndex);
    selectedStoryIndex = storyIndex;
    handleMessage({ type: 'storySelected', storyIndex });
  });

  socket.on('voteUpdate', ({ userId, vote, storyIndex }) => {
    if (!userId) {
      console.warn('[SOCKET] Received vote update without userId:', { vote, storyIndex });
      return;
    }
    console.log('[SOCKET] Vote update received for user', userId, 'on story', storyIndex);
    handleMessage({ type: 'voteUpdate', userId, vote, storyIndex });
  });

  socket.on('storyVotes', ({ storyIndex, votes }) => {
    console.log('[SOCKET] Received votes for story', storyIndex, ':', Object.keys(votes || {}).length, 'votes');
    handleMessage({ type: 'storyVotes', storyIndex, votes: votes || {} });
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
    handleMessage({ type: 'revealVotes', votes: votes || {} });
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
  
  // Error handling
  socket.on('error', (error) => {
    console.error('[SOCKET] Error received from server:', error);
    handleMessage({ type: 'error', error });
  });
  
  // Listen for pong responses to track connection health
  socket.on('pong', () => {
    lastPongTime = Date.now();
    // console.log('[SOCKET] Received pong from server');
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] Disconnected from server. Reason:', reason);
    
    // Clear ping interval on disconnect
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    
    // Update connection status indicator if exists
    if (typeof updateConnectionStatus === 'function') {
      updateConnectionStatus('disconnected');
    }
    
    handleMessage({ type: 'disconnect', reason });
    
    // Attempt automatic reconnection for certain disconnect reasons
    if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`[SOCKET] Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
        
        if (typeof updateConnectionStatus === 'function') {
          updateConnectionStatus('connecting');
        }
        
        // Wait a moment before reconnecting
        setTimeout(() => {
          if (socket && !socket.connected) {
            socket.connect();
          }
        }, 2000);
      }
    }
  });

  socket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error);
    
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      console.log(`[SOCKET] Connection failed, retry attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
    } else {
      console.error('[SOCKET] Maximum reconnection attempts reached');
    }
    
    // Update connection status indicator if exists
    if (typeof updateConnectionStatus === 'function') {
      updateConnectionStatus('connecting');
    }
    
    handleMessage({ type: 'error', error });
  });

  // Return socket for external operations if needed
  return socket;
}

/**
 * Setup ping/pong to keep connection alive during inactivity
 */
function setupPingPong() {
  // Clear any existing ping interval
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  
  // Set up ping every 20 seconds to keep connection alive
  pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      // console.log('[SOCKET] Sending ping to keep connection alive');
      socket.emit('ping');
    } else {
      console.warn('[SOCKET] Cannot ping, socket not connected');
      
      // Try to reconnect if not connected
      reconnect();
    }
  }, 20000); // Send ping every 20 seconds
}

/**
 * Setup connection monitor to detect stale connections
 */
function setupConnectionMonitor(handleMessage) {
  if (connectionMonitorInterval) {
    clearInterval(connectionMonitorInterval);
  }
  
  connectionMonitorInterval = setInterval(() => {
    const now = Date.now();
    const timeSinceLastPong = now - lastPongTime;
    
    // If we haven't received any server response in 2 minutes
    if (timeSinceLastPong > 120000) { // 2 minutes
      console.warn('[SOCKET] No server response for 2 minutes, connection may be stale');
      
      if (socket && socket.connected) {
        // Try to ping the server
        socket.emit('ping');
        
        // If still no response after another 10 seconds, force reconnect
        setTimeout(() => {
          if (Date.now() - lastPongTime > 130000) { // Original 2 min + 10 sec
            console.error('[SOCKET] Confirmed stale connection, forcing reconnect');
            reconnect();
            
            // Notify handler about reconnection attempt
            handleMessage({ type: 'reconnecting' });
          }
        }, 10000);
      } else {
        reconnect();
      }
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Send CSV data to server for synchronization
 * @param {Array} data - CSV data to synchronize
 */
export function emitCSVData(data) {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot send CSV data: socket not connected');
    return;
  }
  
  console.log('[SOCKET] Sending CSV data:', data.length, 'rows');
  socket.emit('syncCSVData', data);
}

/**
 * Emit story selection to server
 * @param {number} index - Index of the selected story
 */
export function emitStorySelected(index) {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot send story selection: socket not connected');
    return;
  }
  
  console.log('[SOCKET] Emitting storySelected:', index);
  socket.emit('storySelected', { storyIndex: index });
  selectedStoryIndex = index;
}

/**
 * Cast a vote for a story
 * @param {string} vote - The vote value
 * @param {string} targetUserId - The user ID receiving the vote (should be your own username)
 */
export function emitVote(vote, targetUserId) {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot send vote: socket not connected');
    return;
  }
  
  // Validate targetUserId is your own username
  if (targetUserId !== userName) {
    console.warn('[SOCKET] You can only vote as yourself. Using your own username instead.');
    targetUserId = userName;
  }
  
  console.log('[SOCKET] Casting vote for user', targetUserId);
  socket.emit('castVote', { vote, targetUserId });
}

/**
 * Request votes for a specific story
 * @param {number} storyIndex - Index of the story
 */
export function requestStoryVotes(storyIndex) {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot request votes: socket not connected');
    return;
  }
  
  console.log('[SOCKET] Requesting votes for story:', storyIndex);
  socket.emit('requestStoryVotes', { storyIndex });
}

/**
 * Reveal votes for the current story
 * Triggers server to broadcast vote values to all clients
 */
export function revealVotes() {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot reveal votes: socket not connected');
    return;
  }
  
  console.log('[SOCKET] Requesting to reveal votes');
  socket.emit('revealVotes');
}

/**
 * Reset votes for the current story
 * Clears all votes and resets the reveal state
 */
export function resetVotes() {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot reset votes: socket not connected');
    return;
  }
  
  console.log('[SOCKET] Requesting to reset votes');
  socket.emit('resetVotes');
}

/**
 * Request export of all votes data
 */
export function requestExport() {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot request export: socket not connected');
    return;
  }
  
  console.log('[SOCKET] Requesting vote data export');
  socket.emit('exportVotes');
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
 * Add a new ticket and sync with other users
 * @param {Object} ticketData - The ticket data {id, text}
 */
export function emitAddTicket(ticketData) {
  if (!socket || !socket.connected) {
    console.error('[SOCKET] Cannot add ticket: socket not connected');
    return;
  }
  
  if (!ticketData || !ticketData.id || !ticketData.text) {
    console.error('[SOCKET] Invalid ticket data:', ticketData);
    return;
  }
  
  console.log('[SOCKET] Adding new ticket:', ticketData);
  
  // Ensure we're sending a consistent format - the raw ticket data
  socket.emit('addTicket', ticketData);
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
    
    // Remember voting system before reconnection
    savedVotingSystem = sessionStorage.getItem('votingSystem') || 'fibonacci';
    
    // Update connection status indicator if exists
    if (typeof updateConnectionStatus === 'function') {
      updateConnectionStatus('connecting');
    }
    
    // Disconnect and reconnect
    socket.disconnect();
    
    setTimeout(() => {
      socket.connect();
      
      // Reset ping/pong mechanism
      setupPingPong();
    }, 1000);
    
    return true;
  }
  
  return false;
}

// Export reconnect function to window for monitoring script
if (typeof window !== 'undefined') {
  window.socketReconnect = reconnect;
}

// Listen for page visibility changes to detect when app is in background
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[SOCKET] Page visible, checking connection');
      if (socket && !socket.connected) {
        reconnect();
      }
    }
  });
}
