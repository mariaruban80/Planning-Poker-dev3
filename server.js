// === server.js ===
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 60000,      // Increased ping timeout to 60 seconds
  pingInterval: 25000,     // Ping clients every 25 seconds
  connectTimeout: 30000,   // Longer connection timeout
  maxHttpBufferSize: 1e6   // 1MB buffer size for data
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Static file serving
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'main.html'));
});
app.use(express.static(join(__dirname, 'public')));

// Enhanced room structure with vote revealing state and connection tracking
const rooms = {}; // roomId: { users, votes, story, revealed, csvData, selectedIndex, votesPerStory, votesRevealed, lastActivity }
const roomVotingSystems = {}; // roomId → voting system
const userConnections = {}; // userId → { connectionCount, lastPing }

// Add room clean-up interval
const ROOM_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const INACTIVE_ROOM_THRESHOLD = 12 * 60 * 60 * 1000; // 12 hours
setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL);

/**
 * Clean up inactive rooms to prevent memory leaks
 */
function cleanupInactiveRooms() {
  const now = Date.now();
  let roomsRemoved = 0;
  
  for (const roomId in rooms) {
    const room = rooms[roomId];
    
    // Check if room has been inactive for the threshold period
    if (room.lastActivity && (now - room.lastActivity > INACTIVE_ROOM_THRESHOLD)) {
      console.log(`[SERVER] Removing inactive room: ${roomId} (inactive for ${Math.round((now - room.lastActivity) / (1000 * 60 * 60))} hours)`);
      delete rooms[roomId];
      delete roomVotingSystems[roomId];
      roomsRemoved++;
    }
  }
  
  if (roomsRemoved > 0) {
    console.log(`[SERVER] Cleaned up ${roomsRemoved} inactive rooms`);
  }
}

/**
 * Update room activity timestamp
 * @param {string} roomId - The room ID to update
 */
function updateRoomActivity(roomId) {
  if (rooms[roomId]) {
    rooms[roomId].lastActivity = Date.now();
  }
}

io.on('connection', (socket) => {
  console.log(`[SERVER] New client connected: ${socket.id}`);
  
  // Handle ping from client (keep-alive)
  socket.on('ping', () => {
    // Respond with pong to confirm connection is alive
    socket.emit('pong');
    
    // Update last activity for the room if available
    const roomId = socket.data.roomId;
    if (roomId) {
      updateRoomActivity(roomId);
    }
    
    // Update user connection tracking
    const userId = socket.data.userName;
    if (userId && userConnections[userId]) {
      userConnections[userId].lastPing = Date.now();
    }
  });
  
  // Handle room joining
  socket.on('joinRoom', ({ roomId, userName, votingSystem }) => {
    // Validate username - reject if missing
    if (!userName) {
      console.log(`[SERVER] Rejected connection without username for socket ${socket.id}`);
      socket.emit('error', { message: 'Username is required to join a room' });
      return;
    }
    
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        votes: {},
        story: [],
        revealed: false,
        csvData: [],
        selectedIndex: 0, // Default to first story
        votesPerStory: {},
        votesRevealed: {}, // Track which stories have revealed votes
        lastActivity: Date.now(), // Track when room was last active
        tickets: [] // Store tickets
      };
    } else {
      // Update room activity timestamp
      updateRoomActivity(roomId);
    }

    // Update user list (remove if exists, then add)
    rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
    rooms[roomId].users.push({ id: socket.id, name: userName });
    socket.join(roomId);
    
    // Track connection count for this user
    if (!userConnections[userName]) {
      userConnections[userName] = { connectionCount: 1, lastPing: Date.now() };
    } else {
      userConnections[userName].connectionCount++;
      userConnections[userName].lastPing = Date.now();
    }

    // Use client's voting system preference if they're first user or if host
    if (votingSystem && (!roomVotingSystems[roomId] || votingSystem === 'host')) {
      console.log(`[SERVER] User ${userName} (${socket.id}) set voting system to ${votingSystem} for room ${roomId}`);
      roomVotingSystems[roomId] = votingSystem;
    }

    // Send current voting system to the joining user
    const currentVotingSystem = roomVotingSystems[roomId] || 'fibonacci';
    socket.emit('votingSystemUpdate', { votingSystem: currentVotingSystem });

    console.log(`[SERVER] User ${userName} (${socket.id}) joined room ${roomId}`);
    
    // Send user list to everyone in the room
    io.to(roomId).emit('userList', rooms[roomId].users);

    // Send CSV data if available
    if (rooms[roomId].csvData?.length > 0) {
      socket.emit('syncCSVData', rooms[roomId].csvData);
    }

    setTimeout(() => {
  const index = rooms[roomId].selectedIndex;
  if (typeof index === 'number') {
    console.log(`[SERVER] Sending selected story index ${index} to ${userName}`);
    socket.emit('storySelected', { storyIndex: index });
  }
}, 300);// small delay to ensure selection is processed
    
  /**  // If room has selected story, send that info
    if (typeof rooms[roomId].selectedIndex === 'number') {
      socket.emit('storySelected', { storyIndex: rooms[roomId].selectedIndex });
    } */
  });

  // Handle ticket synchronization
socket.on('addTicket', (ticketData) => {
  const roomId = socket.data.roomId;
  if (roomId && rooms[roomId]) {
    console.log(`[SERVER] New ticket added to room ${roomId}`);
    updateRoomActivity(roomId);
    
    // Broadcast the new ticket to everyone in the room EXCEPT sender
    socket.broadcast.to(roomId).emit('addTicket', { ticketData });

    // Keep track of tickets on the server
    if (!rooms[roomId].tickets) {
      rooms[roomId].tickets = [];
    }

    rooms[roomId].tickets.push(ticketData);

    // If this is the first ticket or explicitly mark it as selected, update selectedIndex
    const isFirstTicket = rooms[roomId].tickets.length === 1;
    if (isFirstTicket) {
      rooms[roomId].selectedIndex = 0;
      io.to(roomId).emit('storySelected', { storyIndex: 0 });
    }
  }
});
  // Store the selected voting system for the room
  socket.on('votingSystemSelected', ({ roomId, votingSystem }) => {
    if (roomId && votingSystem) {
      console.log(`[SERVER] Host selected voting system '${votingSystem}' for room ${roomId}`);
      roomVotingSystems[roomId] = votingSystem;
      updateRoomActivity(roomId);
      
      // Broadcast the voting system change to all clients in the room
      io.to(roomId).emit('votingSystemUpdate', { votingSystem });
    }
  });

  // Add handler for getting all tickets
  socket.on('requestAllTickets', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId] && rooms[roomId].tickets) {
      console.log(`[SERVER] Sending all tickets to client ${socket.id}`);
      socket.emit('allTickets', { tickets: rooms[roomId].tickets });
      updateRoomActivity(roomId);
    }
  });

  // Handle CSV data loaded confirmation
  socket.on('csvDataLoaded', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      // Now that CSV is loaded, send the current story selection
      if (typeof rooms[roomId].selectedIndex === 'number') {
        const storyIndex = rooms[roomId].selectedIndex;
        console.log(`[SERVER] Client ${socket.id} confirmed CSV loaded, sending current story: ${storyIndex}`);
        socket.emit('storySelected', { storyIndex });
        
        // Send votes for the current story if any exist
        const existingVotes = rooms[roomId].votesPerStory[storyIndex] || {};
        if (Object.keys(existingVotes).length > 0) {
          socket.emit('storyVotes', { storyIndex, votes: existingVotes });
          
          // Also send vote reveal status
          if (rooms[roomId].votesRevealed[storyIndex]) {
            socket.emit('votesRevealed', { storyIndex });
          }
        }
        
        updateRoomActivity(roomId);
      }
    }
  });

  // Handle story selection
  socket.on('storySelected', ({ storyIndex }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] storySelected received from ${socket.id} in room ${roomId}, storyIndex: ${storyIndex}`);
      
      // Store the selected index in room state
      rooms[roomId].selectedIndex = storyIndex;
      updateRoomActivity(roomId);
      
      // Broadcast to ALL clients in the room (including sender for confirmation)
      io.to(roomId).emit('storySelected', { storyIndex });
    }
  });

  // Handle vote casting
  socket.on('castVote', ({ vote, targetUserId }) => {
    const roomId = socket.data.roomId;

    // Only allow users to vote for themselves
    if (roomId && rooms[roomId]) {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      const voterName = socket.data.userName;
      
      // Validate targetUserId matches voterName (can only vote for self)
      if (targetUserId !== voterName) {
        socket.emit('error', { message: 'You can only vote for yourself' });
        return;
      }

      // Initialize vote storage for this story if needed
      if (!rooms[roomId].votesPerStory[currentStoryIndex]) {
        rooms[roomId].votesPerStory[currentStoryIndex] = {};
      }

      // Store the vote using userName instead of socket.id
      rooms[roomId].votesPerStory[currentStoryIndex][voterName] = vote;
      updateRoomActivity(roomId);

      // Broadcast vote using userName
      io.to(roomId).emit('voteUpdate', {
        userId: voterName,
        vote,
        storyIndex: currentStoryIndex
      });
    } else {
      socket.emit('error', { message: 'You can only vote for yourself' });
    }
  });

  // Handle requests for votes for a specific story
  socket.on('requestStoryVotes', ({ storyIndex }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const votes = rooms[roomId].votesPerStory[storyIndex] || {};
      console.log(`[SERVER] Sending votes for story ${storyIndex} to client ${socket.id}`);
      socket.emit('storyVotes', { storyIndex, votes });
      
      // If votes have been revealed for this story, also send that info
      if (rooms[roomId].votesRevealed[storyIndex]) {
        socket.emit('votesRevealed', { storyIndex });
      }
      
      updateRoomActivity(roomId);
    }
  });

  // Handle vote revealing
  socket.on('revealVotes', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      
      // Mark this story as having revealed votes
      rooms[roomId].votesRevealed[currentStoryIndex] = true;
      updateRoomActivity(roomId);
      
      // Send the reveal signal to all clients
      io.to(roomId).emit('votesRevealed', { storyIndex: currentStoryIndex });
      
      console.log(`[SERVER] Votes revealed for story ${currentStoryIndex} in room ${roomId}`);
    }
  });

  // Handle vote reset for current story
  socket.on('resetVotes', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      
      // Clear votes for the current story
      if (rooms[roomId].votesPerStory[currentStoryIndex]) {
        rooms[roomId].votesPerStory[currentStoryIndex] = {};
        // Reset revealed status
        rooms[roomId].votesRevealed[currentStoryIndex] = false;
        
        console.log(`[SERVER] Votes reset for story ${currentStoryIndex} in room ${roomId}`);
        updateRoomActivity(roomId);
        io.to(roomId).emit('votesReset', { storyIndex: currentStoryIndex });
      }
    }
  });

  // Handle story changes
  socket.on('storyChange', ({ story }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].story = story;
      updateRoomActivity(roomId);
      io.to(roomId).emit('storyChange', { story });
    }
  });

  // Handle story navigation
  socket.on('storyNavigation', ({ index }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      updateRoomActivity(roomId);
      io.to(roomId).emit('storyNavigation', { index });
    }
  });

  // Handle CSV data synchronization
  socket.on('syncCSVData', (csvData) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].csvData = csvData;
      rooms[roomId].selectedIndex = 0; // Reset selected index when new CSV data is loaded
      rooms[roomId].votesPerStory = {}; // Reset all votes when new CSV data is loaded
      rooms[roomId].votesRevealed = {}; // Reset all reveal states when new CSV data is loaded
      updateRoomActivity(roomId);
      io.to(roomId).emit('syncCSVData', csvData);
    }
  });

  // Export votes data (optional feature)
  socket.on('exportVotes', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const exportData = {
        room: roomId,
        stories: rooms[roomId].csvData,
        votes: rooms[roomId].votesPerStory,
        revealed: rooms[roomId].votesRevealed,
        timestamp: new Date().toISOString()
      };
      
      updateRoomActivity(roomId);
      socket.emit('exportData', exportData);
    }
  });

  // Handle client heartbeats for activity tracking
  socket.on('heartbeat', () => {
    const roomId = socket.data.roomId;
    const userName = socket.data.userName;
    
    if (roomId) {
      updateRoomActivity(roomId);
    }
    
    if (userName && userConnections[userName]) {
      userConnections[userName].lastPing = Date.now();
    }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const userName = socket.data.userName;
    
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] Client disconnected: ${socket.id} from room ${roomId}`);
      
      // Remove user from room
      rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
      
      // Update activity timestamp on disconnect
      updateRoomActivity(roomId);
      
      // Notify remaining users
      io.to(roomId).emit('userList', rooms[roomId].users);
      
      // Track user disconnection
      if (userName && userConnections[userName]) {
        userConnections[userName].connectionCount--;
        
        // Remove user tracking if no connections left
        if (userConnections[userName].connectionCount <= 0) {
          delete userConnections[userName];
        }
      }
      
      // Clean up empty rooms
      if (rooms[roomId].users.length === 0) {
        console.log(`[SERVER] Removing empty room: ${roomId}`);
        delete rooms[roomId];
        delete roomVotingSystems[roomId];
      }
    }
  });
});

// Error handling for the HTTP server
httpServer.on('error', (error) => {
  console.error('[SERVER ERROR]', error);
});

// Add periodic server status logging
setInterval(() => {
  const activeRooms = Object.keys(rooms).length;
  const totalUsers = Object.values(rooms).reduce((count, room) => count + room.users.length, 0);
  const activeConnections = Object.keys(userConnections).length;
  
  console.log(`[SERVER STATUS] Active rooms: ${activeRooms}, Users: ${totalUsers}, Active connections: ${activeConnections}`);
}, 5 * 60 * 1000); // Log every 5 minutes

// Server startup
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
