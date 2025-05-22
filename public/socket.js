// === socket.js ===
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

let socket = null;
let roomId = null;
let userName = null;
let reconnectionEnabled = true;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;

export function initializeWebSocket(roomIdentifier, userNameValue, handleMessage) {
    if (!userNameValue) {
        console.error('[SOCKET] Username is required.');
        return null;
    }

    roomId = roomIdentifier;
    userName = userNameValue;
    reconnectAttempts = 0;

    socket = io({
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        query: { roomId: roomIdentifier, userName: userNameValue }
    });

    // Connection Event Handlers
    socket.on('connect', () => {
        console.log('[SOCKET] Connected:', socket.id);
        reconnectAttempts = 0;
        socket.emit('joinRoom', { roomId, userName });
        handleMessage({ type: 'connect' });
    });

    socket.on('reconnect_attempt', (attempt) => {
        console.log(`[SOCKET] Reconnection attempt ${attempt}`);
        reconnectAttempts = attempt;
        handleMessage({ type: 'reconnect_attempt', attempt });
    });

    socket.on('reconnect', () => {
        console.log('[SOCKET] Reconnected');
        socket.emit('joinRoom', { roomId, userName });
        handleMessage({ type: 'reconnect' });
        reconnectAttempts = 0;

        // Request Current Story Selection on Reconnect
        if (roomId && userName) {
            requestCurrentStory();
        }
    });

    socket.on('reconnect_error', (error) => {
        console.error('[SOCKET] Reconnection error:', error);
        handleMessage({ type: 'error', error });
        if (reconnectAttempts < maxReconnectAttempts && reconnectionEnabled) {
            console.log(`[SOCKET] Will retry (${reconnectAttempts}/${maxReconnectAttempts})`);
        } else {
            console.error('[SOCKET] Max reconnection attempts reached.');
            handleMessage({ type: 'reconnection_failed' });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('[SOCKET] Disconnected:', reason);
        if (reason === 'io server disconnect' && reconnectionEnabled) {
            console.log('[SOCKET] Server disconnected. Reconnecting...');
            socket.connect();
        }
        handleMessage({ type: 'disconnect', reason });
    });



    // Main Event Handlers — Updated for storyId
    socket.on('userList', (users) => handleMessage({ type: 'userList', users }));
    socket.on('votingSystemUpdate', data => handleMessage({ type: 'votingSystemUpdate', ...data }));
    socket.on('syncCSVData', (csvData) => {
        handleMessage({ type: 'syncCSVData', csvData });
        if (socket) socket.emit('csvDataLoaded'); // Notify server after data load
    });

    socket.on('storySelected', ({ storyId }) => handleMessage({ type: 'storySelected', storyId }));
    socket.on('storyVotes', ({ storyId, votes }) => handleMessage({ type: 'storyVotes', storyId, votes }));
    socket.on('votesRevealed', ({ storyId, votes }) => handleMessage({ type: 'votesRevealed', storyId, votes }));
    socket.on('deleteStory', ({ storyId }) => handleMessage({ type: 'deleteStory', storyId }));
    socket.on('votesReset', ({ storyId }) => handleMessage({ type: 'votesReset', storyId }));
    socket.on('voteUpdate', ({ userId, vote, storyId }) => handleMessage({ type: 'voteUpdate', userId, vote, storyId }));
    socket.on('storyChange', ({ story }) => handleMessage({ type: 'storyChange', story }));
    socket.on('storyNavigation', ({ index }) => handleMessage({ type: 'storyNavigation', index }));

    socket.on('connect_error', error => handleMessage({ type: 'error', error }));
    socket.on('exportData', data => handleMessage({ type: 'exportData', data }));

    return socket;
}


export function emitDeleteStory(storyId) {
  if (socket) {
      socket.emit('deleteStory', { storyId });
  }
}

export function emitCSVData(data) {
  if (socket) {
      socket.emit('syncCSVData', data);
  }
}

export function emitStorySelected(storyId) {
  if (socket) {
      socket.emit('storySelected', { storyId });
  }
}

export function emitVote(vote, targetUserId, storyId) {
  if (socket) {
      socket.emit('castVote', { vote, targetUserId, storyId });
  }
}

export function requestStoryVotes(storyId) {
    if (socket) {
        socket.emit('requestStoryVotes', { storyId });
    }
}

export function revealVotes(storyId) {
    if (socket) {
        socket.emit('revealVotes', { storyId });
    }
}

export function resetVotes(storyId) {
    if (socket) {
        socket.emit('resetVotes', { storyId });
    }
}

export function requestExport() {
    if (socket) {
        socket.emit('exportVotes');
    }
}

export function isConnected() {
    return socket && socket.connected;
}

export function emitAddTicket(ticketData) {
    if (socket) {
        socket.emit('addTicket', ticketData);
    }
}

export function reconnect() {
    if (!socket) return false;
    if (!socket.connected && roomId && userName) {
        socket.connect();
        return true;
    }
    return false;
}

export function setReconnectionEnabled(enable) {
    reconnectionEnabled = enable;
}

export function requestAllTickets() {
    if (socket) {
        socket.emit('requestAllTickets');
    }
}

export function requestCurrentStory () {
    if (socket) {
        console.log('[SOCKET] Requesting current story from server...');
        socket.emit('requestCurrentStory');
    }    
}


export function setMaxReconnectAttempts(max) {
    if (typeof max === 'number' && max > 0) {
        maxReconnectAttempts = max;
    }
}

export function getReconnectionStatus() {
    return {
        enabled: reconnectionEnabled,
        attempts: reconnectAttempts,
        maxAttempts: maxReconnectAttempts,
        connected: socket ? socket.connected : false
    };
}
