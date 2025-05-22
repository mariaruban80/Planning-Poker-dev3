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

    socket.on('connect', () => {
        console.log('[SOCKET] Connected:', socket.id);
        reconnectAttempts = 0;
        socket.emit('joinRoom', { roomId, userName });
        handleMessage({ type: 'connect' }); // Notify UI of successful connection
    });

    socket.on('reconnect_attempt', (attempt) => {
        console.log(`[SOCKET] Reconnection attempt ${attempt}`);
        reconnectAttempts = attempt;
        handleMessage({ type: 'reconnect_attempt', attempt });
    });

    socket.on('reconnect', () => {
        console.log('[SOCKET] Reconnected');
        socket.emit('joinRoom', { roomId, userName }); // Re-join room
        
        handleMessage({ type: 'reconnect' });
        reconnectAttempts = 0;
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
            socket.connect(); // Attempt to reconnect if the server disconnected us
        }
        handleMessage({ type: 'disconnect', reason }); // Notify UI of disconnect
    });    

    socket.on('userList', (users) => handleMessage({ type: 'userList', users }));
    socket.on('votingSystemUpdate', data => handleMessage({ type: 'votingSystemUpdate', ...data }));
    socket.on('syncCSVData', (csvData) => {
        handleMessage({ type: 'syncCSVData', csvData });
        socket.emit('csvDataLoaded'); // Notify server CSV is loaded
    });
    socket.on('storySelected', ({ storyId }) => {
        console.log('[SOCKET] Story selected:', storyId);
        handleMessage({ type: 'storySelected', storyId });
    });
    socket.on('storyVotes', ({ storyId, votes }) => {
        console.log('[SOCKET] Received votes for', storyId, ':', votes);
        handleMessage({ type: 'storyVotes', storyId, votes });
    });
    socket.on('votesRevealed', ({ storyId }) => {
        console.log('[SOCKET] Votes revealed for', storyId);
        handleMessage({ type: 'votesRevealed', storyId });
    });
    socket.on('deleteStory', ({ storyId }) => handleMessage({ type: 'deleteStory', storyId }));
    socket.on('votesReset', ({ storyId }) => handleMessage({ type: 'votesReset', storyId }));
    socket.on('voteUpdate', ({ userId, vote, storyId }) => {
        console.log(`[SOCKET] ${userId} voted ${vote} for ${storyId}.`);
        handleMessage({ type: 'voteUpdate', userId, vote, storyId});
    });
    socket.on('storyChange', ({ story }) => handleMessage({ type: 'storyChange', story }));
    socket.on('storyNavigation', ({ index }) => handleMessage({ type: 'storyNavigation', index }));
    socket.on('connect_error', error => handleMessage({ type: 'error', error }));
    socket.on('exportData', data => handleMessage({ type: 'exportData', data }));    

    return socket;
}


// ... other existing functions (emitDeleteStory, emitCSVData, etc.)

export function emitStorySelected(storyId) {
    if (socket) {
        console.log('[SOCKET] Emitting storySelected:', storyId);
        socket.emit('storySelected', { storyId });
    }
}

export function requestStoryVotes(storyId) {
    if (socket) {
        console.log('[SOCKET] Requesting votes for story:', storyId);
        socket.emit('requestStoryVotes', { storyId });
    }
}

// ... other existing functions (revealVotes, resetVotes, etc.)
