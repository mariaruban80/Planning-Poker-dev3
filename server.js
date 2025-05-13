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
  pingTimeout: 60000, // Longer timeout for more stable connections
  pingInterval: 25000  // More frequent heartbeats
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'main.html'));
});
app.use(express.static(join(__dirname, 'public')));

// Enhanced room structure with persistent votes
const rooms = {};
const roomVotingSystems = {};
const userNameToSocketId = {};
const socketIdToUserName = {}; // Reverse lookup

// Debug logging for vote states (helps with troubleshooting)
function logRoomVotes(roomId, context) {
  if (!rooms[roomId]) return;
  
  const voteInfo = {
    currentStory: rooms[roomId].selectedIndex,
    totalStories: Object.keys(rooms[roomId].votesPerStory).length,
    totalUsers: Object.keys(rooms[roomId].persistentUserVotes || {}).length,
    revealed: rooms[roomId].votesRevealed[rooms[roomId].selectedIndex] || false
  };
  
  console.log(`[VOTES:${context}] Room ${roomId}:`, JSON.stringify(voteInfo));
}

// Helper function to update vote mappings when a user reconnects with a new socket ID
function updateUserIdInVotes(roomId, oldUserId, newUserId) {
  if (!rooms[roomId] || !rooms[roomId].votesPerStory) return;
  
  try {
    Object.keys(rooms[roomId].votesPerStory).forEach(storyIndex => {
      const storyVotes = rooms[roomId].votesPerStory[storyIndex];
      if (storyVotes && storyVotes[oldUserId]) {
        // Copy the vote to the new ID
        storyVotes[newUserId] = storyVotes[oldUserId];
        // Remove the old ID
        delete storyVotes[oldUserId];
        console.log(`[SERVER] Updated vote for story ${storyIndex} from ${oldUserId} to ${newUserId}`);
      }
    });
  } catch (error) {
    console.error(`[SERVER] Error updating user ID in votes:`, error);
  }
}

// Ensure a story's vote storage is properly initialized
function ensureStoryVoteStorage(roomId, storyIndex) {
  if (!rooms[roomId]) return;
  
  if (!rooms[roomId].votesPerStory) {
    rooms[roomId].votesPerStory = {};
  }
  
  if (!rooms[roomId].votesPerStory[storyIndex]) {
    rooms[roomId].votesPerStory[storyIndex] = {};
  }
  
  if (!rooms[roomId].votesRevealed) {
    rooms[roomId].votesRevealed = {};
  }
}

// Synchronize all votes for a story to a specific client
function syncStoryVotesToClient(socket, roomId, storyIndex) {
  if (!rooms[roomId] || !rooms[roomId].votesPerStory || !rooms[roomId].votesPerStory[storyIndex]) {
    return;
  }
  
  const votes = rooms[roomId].votesPerStory[storyIndex];
  
  // Only send if there are votes
  if (Object.keys(votes).length > 0) {
    console.log(`[SERVER] Syncing ${Object.keys(votes).length} votes for story ${storyIndex} to client ${socket.id}`);
    socket.emit('storyVotes', { storyIndex, votes });
    
    // Also send reveal state
    if (rooms[roomId].votesRevealed[storyIndex]) {
      socket.emit('votesRevealed', { storyIndex });
    }
  }
}

// Rebuild the votesPerStory structure from the persistent votes
function rebuildVotesFromPersistent(roomId) {
  if (!rooms[roomId] || !rooms[roomId].persistentUserVotes) return;
  
  try {
    // Reset votesPerStory to rebuild it
    rooms[roomId].votesPerStory = {};
    
    // Rebuild from persistent votes
    Object.entries(rooms[roomId].persistentUserVotes).forEach(([userName, userData]) => {
      const userId = userData.userId;
      
      if (!userId || !userData.votes) return;
      
      Object.entries(userData.votes).forEach(([storyIndex, vote]) => {
        ensureStoryVoteStorage(roomId, storyIndex);
        rooms[roomId].votesPerStory[storyIndex][userId] = vote;
      });
    });
    
    console.log(`[SERVER] Rebuilt vote structure for room ${roomId}`);
  } catch (error) {
    console.error(`[SERVER] Error rebuilding votes:`, error);
  }
}

io.on('connection', (socket) => {
  console.log(`[SERVER] New client connected: ${socket.id}`);
  
  // Handle room joining with enhanced persistence
  socket.on('joinRoom', ({ roomId, userName }) => {
    // Validate username
    if (!userName) {
      console.log(`[SERVER] Rejected connection without username for socket ${socket.id}`);
      socket.emit('error', { message: 'Username is required to join a room' });
      return;
    }
    
    // Store user data for lookup
    socket.data.roomId = roomId;
    socket.data.userName = userName;
    socketIdToUserName[socket.id] = userName;

    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        votes: {},
        story: [],
        revealed: false,
        csvData: [],
        selectedIndex: 0,
        votesPerStory: {},
        votesRevealed: {},
        persistentUserVotes: {},
        tickets: []
      };
    }

    // Initialize persistent user votes
    if (!rooms[roomId].persistentUserVotes) {
      rooms[roomId].persistentUserVotes = {};
    }
    
    // Check if this user is reconnecting with a new socket ID
    if (userNameToSocketId[userName] && userNameToSocketId[userName] !== socket.id) {
      const oldSocketId = userNameToSocketId[userName];
      console.log(`[SERVER] User ${userName} reconnecting with new socket ID (${oldSocketId} → ${socket.id})`);
      
      // Update vote mappings
      updateUserIdInVotes(roomId, oldSocketId, socket.id);
    }
    
    // Record this user's socket ID
    userNameToSocketId[userName] = socket.id;
    
    // Associate socket with persistent votes
    if (!rooms[roomId].persistentUserVotes[userName]) {
      rooms[roomId].persistentUserVotes[userName] = {
        userId: socket.id,
        votes: {}
      };
    } else {
      // Update the socket ID for returning user
      rooms[roomId].persistentUserVotes[userName].userId = socket.id;
      
      // Restore user's previous votes to the current votesPerStory structure
      const userVotes = rooms[roomId].persistentUserVotes[userName].votes;
      
      for (const storyIndex in userVotes) {
        ensureStoryVoteStorage(roomId, storyIndex);
        rooms[roomId].votesPerStory[storyIndex][socket.id] = userVotes[storyIndex];
      }
      
      // Send the user their previous votes
      socket.emit('restoreUserVotes', { userVotes });
    }

    // Update user list
    rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
    rooms[roomId].users.push({ id: socket.id, name: userName });
    socket.join(roomId);
    
    // Send the current voting system to the joining user
    const votingSystem = roomVotingSystems[roomId] || 'fibonacci';
    socket.emit('votingSystemUpdate', { votingSystem });

    // IMPORTANT: Send the current story selection first
    const currentStoryIndex = rooms[roomId].selectedIndex;
    socket.emit('storySelected', { storyIndex: currentStoryIndex });
    
    // Then add a small delay before sending votes to ensure the client is ready
    setTimeout(() => {
      try {
        // Synchronize current story votes
        if (rooms[roomId].votesPerStory[currentStoryIndex]) {
          syncStoryVotesToClient(socket, roomId, currentStoryIndex);
        }
      } catch (error) {
        console.error(`[SERVER] Error syncing votes on join:`, error);
      }
      
      // Log the state for debugging
      logRoomVotes(roomId, "afterJoin");
    }, 500); // Give client time to process story selection

    console.log(`[SERVER] User ${userName} (${socket.id}) joined room ${roomId}`);
    
    // Send user list to everyone in the room
    io.to(roomId).emit('userList', rooms[roomId].users);

    // Send CSV data if available
    if (rooms[roomId].csvData?.length > 0) {
      socket.emit('syncCSVData', rooms[roomId].csvData);
    }
  });
  
  // Handle ticket synchronization
  socket.on('addTicket', (ticketData) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] New ticket added to room ${roomId}`);
      
      // Broadcast the new ticket to everyone in the room EXCEPT sender
      socket.broadcast.to(roomId).emit('addTicket', { ticketData });
      
      // Keep track of tickets on the server
      if (!rooms[roomId].tickets) {
        rooms[roomId].tickets = [];
      }
      rooms[roomId].tickets.push(ticketData);
    }
  });
  
  // NEW: Handle explicit vote synchronization request
  socket.on('syncAllVotes', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    try {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      
      // Rebuild the votes structure first to ensure consistency
      rebuildVotesFromPersistent(roomId);
      
      // Then sync votes for the current story
      syncStoryVotesToClient(socket, roomId, currentStoryIndex);
      
      console.log(`[SERVER] Synced all votes for room ${roomId} to client ${socket.id}`);
    } catch (error) {
      console.error(`[SERVER] Error in syncAllVotes:`, error);
    }
  });
  
  // Store the selected voting system for the room
  socket.on('votingSystemSelected', ({ roomId, votingSystem }) => {
    if (roomId && votingSystem) {
      console.log(`[SERVER] Host selected voting system '${votingSystem}' for room ${roomId}`);
      roomVotingSystems[roomId] = votingSystem;
      io.to(roomId).emit('votingSystemUpdate', { votingSystem });
    }
  });
  
  // Handle request for all tickets
  socket.on('requestAllTickets', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId] && rooms[roomId].tickets) {
      console.log(`[SERVER] Sending all tickets to client ${socket.id}`);
      socket.emit('allTickets', { tickets: rooms[roomId].tickets });
    }
  });
  
  // Enhanced request to restore user votes
  socket.on('requestUserVoteRestore', () => {
    try {
      const roomId = socket.data.roomId;
      const userName = socket.data.userName;
      
      if (!roomId || !rooms[roomId] || !userName) return;
      
      // First, restore the user's own votes
      if (rooms[roomId].persistentUserVotes[userName]) {
        const userVotes = rooms[roomId].persistentUserVotes[userName].votes;
        if (Object.keys(userVotes).length > 0) {
          socket.emit('restoreUserVotes', { userVotes });
        }
      }
      
      // Then, after a small delay, sync the current story's votes
      setTimeout(() => {
        const currentStoryIndex = rooms[roomId].selectedIndex;
        syncStoryVotesToClient(socket, roomId, currentStoryIndex);
      }, 300);
    } catch (error) {
      console.error(`[SERVER] Error restoring votes:`, error);
    }
  });

  // Handle CSV data loaded confirmation
  socket.on('csvDataLoaded', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      // Now that CSV is loaded, send the current story selection
      const storyIndex = rooms[roomId].selectedIndex;
      console.log(`[SERVER] Client ${socket.id} confirmed CSV loaded, sending current story: ${storyIndex}`);
      socket.emit('storySelected', { storyIndex });
      
      // Add small delay to ensure client has processed story selection
      setTimeout(() => {
        // Then send votes
        syncStoryVotesToClient(socket, roomId, storyIndex);
      }, 300);
    }
  });

  // Handle story selection
  socket.on('storySelected', ({ storyIndex }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    console.log(`[SERVER] storySelected received from ${socket.id} in room ${roomId}, storyIndex: ${storyIndex}`);
    
    // Store the selected index in room state
    rooms[roomId].selectedIndex = storyIndex;
    
    // Ensure vote storage is initialized for this story
    ensureStoryVoteStorage(roomId, storyIndex);
    
    // Broadcast to ALL clients in the room
    io.to(roomId).emit('storySelected', { storyIndex });
    
    // Then sync votes for this story to all clients
    setTimeout(() => {
      const votes = rooms[roomId].votesPerStory[storyIndex] || {};
      if (Object.keys(votes).length > 0) {
        io.to(roomId).emit('storyVotes', { storyIndex, votes });
        
        // If votes are revealed, broadcast that too
        if (rooms[roomId].votesRevealed[storyIndex]) {
          io.to(roomId).emit('votesRevealed', { storyIndex });
        }
      }
    }, 300);
  });

  // Enhanced vote handling with persistence
  socket.on('castVote', ({ vote, targetUserId }) => {
    const roomId = socket.data.roomId;
    const userName = socket.data.userName;
    
    // Only allow users to vote for themselves
    if (!roomId || !rooms[roomId] || targetUserId !== socket.id || !userName) {
      socket.emit('error', { message: 'You can only vote for yourself' });
      return;
    }
    
    try {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      
      // Ensure vote storage structures
      ensureStoryVoteStorage(roomId, currentStoryIndex);
      
      // Store the vote
      rooms[roomId].votesPerStory[currentStoryIndex][targetUserId] = vote;
      
      // Store in persistent user votes
      if (rooms[roomId].persistentUserVotes[userName]) {
        rooms[roomId].persistentUserVotes[userName].votes[currentStoryIndex] = vote;
      }
      
      // Broadcast vote to all clients
      io.to(roomId).emit('voteUpdate', {
        userId: targetUserId,
        vote,
        storyIndex: currentStoryIndex
      });
      
      logRoomVotes(roomId, "afterVote");
    } catch (error) {
      console.error(`[SERVER] Error processing vote:`, error);
      socket.emit('error', { message: 'Error processing vote' });
    }
  });
  
  // Enhanced request for votes for a specific story
  socket.on('requestStoryVotes', ({ storyIndex }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    try {
      // Ensure story vote storage is initialized
      ensureStoryVoteStorage(roomId, storyIndex);
      
      // Synchronize votes for this story
      syncStoryVotesToClient(socket, roomId, storyIndex);
    } catch (error) {
      console.error(`[SERVER] Error handling requestStoryVotes:`, error);
    }
  });

  // Handle vote revealing
  socket.on('revealVotes', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    const currentStoryIndex = rooms[roomId].selectedIndex;
    
    // Mark this story as having revealed votes
    rooms[roomId].votesRevealed[currentStoryIndex] = true;
    
    // Send the reveal signal to all clients
    io.to(roomId).emit('votesRevealed', { storyIndex: currentStoryIndex });
    
    console.log(`[SERVER] Votes revealed for story ${currentStoryIndex} in room ${roomId}`);
    logRoomVotes(roomId, "afterReveal");
  });

  // Enhanced vote reset handling
  socket.on('resetVotes', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    try {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      
      // Clear votes for the current story
      if (rooms[roomId].votesPerStory[currentStoryIndex]) {
        rooms[roomId].votesPerStory[currentStoryIndex] = {};
        
        // Clear from persistent storage for all users
        if (rooms[roomId].persistentUserVotes) {
          Object.keys(rooms[roomId].persistentUserVotes).forEach(userName => {
            if (rooms[roomId].persistentUserVotes[userName].votes) {
              delete rooms[roomId].persistentUserVotes[userName].votes[currentStoryIndex];
            }
          });
        }
        
        // Reset revealed status
        rooms[roomId].votesRevealed[currentStoryIndex] = false;
        
        console.log(`[SERVER] Votes reset for story ${currentStoryIndex} in room ${roomId}`);
        io.to(roomId).emit('votesReset', { storyIndex: currentStoryIndex });
      }
    } catch (error) {
      console.error(`[SERVER] Error resetting votes:`, error);
    }
  });

  // Handle story changes
  socket.on('storyChange', ({ story }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].story = story;
      io.to(roomId).emit('storyChange', { story });
    }
  });

  // Handle CSV data synchronization
  socket.on('syncCSVData', (csvData) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    try {
      rooms[roomId].csvData = csvData;
      rooms[roomId].selectedIndex = 0; // Reset selected index when new CSV data is loaded
      
      // We don't reset votes to maintain persistence
      io.to(roomId).emit('syncCSVData', csvData);
    } catch (error) {
      console.error(`[SERVER] Error syncing CSV data:`, error);
    }
  });

  // Export votes data
  socket.on('exportVotes', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    try {
      // Rebuild votes structure before exporting to ensure consistency
      rebuildVotesFromPersistent(roomId);
      
      const exportData = {
        room: roomId,
        stories: rooms[roomId].csvData,
        votes: rooms[roomId].votesPerStory,
        revealed: rooms[roomId].votesRevealed,
        timestamp: new Date().toISOString()
      };
      
      socket.emit('exportData', exportData);
    } catch (error) {
      console.error(`[SERVER] Error exporting votes:`, error);
    }
  });

  // Enhanced disconnection handling
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const userName = socket.data.userName || socketIdToUserName[socket.id];
    
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] Client disconnected: ${socket.id} (${userName}) from room ${roomId}`);
      
      // Remove user from room's active users list
      rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
      
      // Notify remaining users
      io.to(roomId).emit('userList', rooms[roomId].users);
      
      // Don't delete from userNameToSocketId to maintain the mapping
      // This allows us to update when they reconnect
      
      // Clean up reverse lookup
      delete socketIdToUserName[socket.id];
      
      // Clean up empty rooms after a delay (in case users reconnect)
      if (rooms[roomId].users.length === 0) {
        setTimeout(() => {
          if (rooms[roomId] && rooms[roomId].users.length === 0) {
            console.log(`[SERVER] Removing empty room: ${roomId}`);
            delete rooms[roomId];
            delete roomVotingSystems[roomId];
          }
        }, 60000); // 1 minute grace period
      }
    }
  });
});

// Add error handling for uncaught exceptions to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Rejection:', reason);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
