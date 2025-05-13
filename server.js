// === server.js ===
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Added to call the main.html file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'main.html'));
});
app.use(express.static(join(__dirname, 'public')));

// Enhanced room structure with persistent votes
const rooms = {}; // roomId: { users, votes, story, revealed, csvData, selectedIndex, votesPerStory, votesRevealed, persistentUserVotes, tickets }
const roomVotingSystems = {}; // roomId → voting system
const userNameToSocketId = {}; // userName → latest socketId

// Helper function to update vote mappings when a user reconnects with a new socket ID
function updateUserIdInVotes(roomId, oldUserId, newUserId) {
  if (!rooms[roomId] || !rooms[roomId].votesPerStory) return;
  
  // For each story's votes
  Object.keys(rooms[roomId].votesPerStory).forEach(storyIndex => {
    const storyVotes = rooms[roomId].votesPerStory[storyIndex];
    if (storyVotes && storyVotes[oldUserId]) {
      // Copy the vote to the new ID
      storyVotes[newUserId] = storyVotes[oldUserId];
      // Remove the old ID
      delete storyVotes[oldUserId];
    }
  });
}

io.on('connection', (socket) => {
  console.log(`[SERVER] New client connected: ${socket.id}`);
  
  // Handle room joining
  socket.on('joinRoom', ({ roomId, userName }) => {
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
        votesRevealed: {},
        persistentUserVotes: {},
        tickets: []
      };
    }

    // Check if this user is reconnecting with a new socket ID
    if (userNameToSocketId[userName] && userNameToSocketId[userName] !== socket.id) {
      const oldSocketId = userNameToSocketId[userName];
      console.log(`[SERVER] User ${userName} reconnecting with new socket ID, updating mappings`);
      updateUserIdInVotes(roomId, oldSocketId, socket.id);
    }
    
    // Record this user's socket ID
    userNameToSocketId[userName] = socket.id;

    // Initialize persistent user votes if not exists
    if (!rooms[roomId].persistentUserVotes) {
      rooms[roomId].persistentUserVotes = {};
    }
    
    // Associate this socket with the user's previous votes if they exist
    if (!rooms[roomId].persistentUserVotes[userName]) {
      rooms[roomId].persistentUserVotes[userName] = {
        userId: socket.id,
        votes: {} // storyIndex: vote
      };
    } else {
      // Update the socket ID for returning user
      rooms[roomId].persistentUserVotes[userName].userId = socket.id;
      
      // Restore user's previous votes to the current votesPerStory structure
      const userVotes = rooms[roomId].persistentUserVotes[userName].votes;
      
      for (const storyIndex in userVotes) {
        if (!rooms[roomId].votesPerStory[storyIndex]) {
          rooms[roomId].votesPerStory[storyIndex] = {};
        }
        rooms[roomId].votesPerStory[storyIndex][socket.id] = userVotes[storyIndex];
      }
      
      // Send the user their previous votes
      socket.emit('restoreUserVotes', { userVotes });
    }

    // Update user list (remove if exists, then add)
    rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
    rooms[roomId].users.push({ id: socket.id, name: userName });
    socket.join(roomId);
    
    // Send the current voting system to the joining user
    const votingSystem = roomVotingSystems[roomId] || 'fibonacci';
    socket.emit('votingSystemUpdate', { votingSystem });

    // If there's a currently selected story, immediately send its votes to the joining user
    const currentStoryIndex = rooms[roomId].selectedIndex;
    if (rooms[roomId].votesPerStory[currentStoryIndex] && Object.keys(rooms[roomId].votesPerStory[currentStoryIndex]).length > 0) {
      // Send all votes for the current story
      socket.emit('storyVotes', { 
        storyIndex: currentStoryIndex, 
        votes: rooms[roomId].votesPerStory[currentStoryIndex]
      });
      
      // If votes have been revealed for the current story, also send that status
      if (rooms[roomId].votesRevealed[currentStoryIndex]) {
        socket.emit('votesRevealed', { storyIndex: currentStoryIndex });
      }
    }

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
      
      // Keep track of tickets on the server (optional)
      if (!rooms[roomId].tickets) {
        rooms[roomId].tickets = [];
      }
      rooms[roomId].tickets.push(ticketData);
    }
  });
  
  // Store the selected voting system for the room
  socket.on('votingSystemSelected', ({ roomId, votingSystem }) => {
    if (roomId && votingSystem) {
      console.log(`[SERVER] Host selected voting system '${votingSystem}' for room ${roomId}`);
      roomVotingSystems[roomId] = votingSystem;
      // Broadcast to all clients in the room
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
  
  // Handle request to restore user votes
  socket.on('requestUserVoteRestore', () => {
    const roomId = socket.data.roomId;
    const userName = socket.data.userName;
    
    if (roomId && rooms[roomId] && rooms[roomId].persistentUserVotes && userName) {
      const persistentVotes = rooms[roomId].persistentUserVotes[userName];
      if (persistentVotes && Object.keys(persistentVotes.votes).length > 0) {
        console.log(`[SERVER] Restoring votes for user ${userName} in room ${roomId}`);
        socket.emit('restoreUserVotes', { userVotes: persistentVotes.votes });
      }
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
      
      // Broadcast to ALL clients in the room (including sender for confirmation)
      io.to(roomId).emit('storySelected', { storyIndex });
    }
  });

  // Handle user votes with persistence
  socket.on('castVote', ({ vote, targetUserId }) => {
    const roomId = socket.data.roomId;
    const userName = socket.data.userName;
    
    // Only allow users to vote for themselves
    if (roomId && rooms[roomId] && targetUserId === socket.id) {
      const currentStoryIndex = rooms[roomId].selectedIndex;

      // Initialize vote storage for this story if needed
      if (!rooms[roomId].votesPerStory[currentStoryIndex]) {
        rooms[roomId].votesPerStory[currentStoryIndex] = {};
      }

      // Store the vote
      rooms[roomId].votesPerStory[currentStoryIndex][targetUserId] = vote;
      
      // Store in persistent user votes
      if (userName && rooms[roomId].persistentUserVotes[userName]) {
        rooms[roomId].persistentUserVotes[userName].votes[currentStoryIndex] = vote;
      }

      // Broadcast vote to all clients in the room
      io.to(roomId).emit('voteUpdate', {
        userId: targetUserId,
        vote,
        storyIndex: currentStoryIndex
      });
    } else {
      // Optionally notify the user that they can only vote for themselves
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
    }
  });

  // Handle vote revealing
  socket.on('revealVotes', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      
      // Mark this story as having revealed votes
      rooms[roomId].votesRevealed[currentStoryIndex] = true;
      
      // Send the reveal signal to all clients
      io.to(roomId).emit('votesRevealed', { storyIndex: currentStoryIndex });
      
      console.log(`[SERVER] Votes revealed for story ${currentStoryIndex} in room ${roomId}`);
    }
  });

  // Handle vote reset
  socket.on('resetVotes', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const currentStoryIndex = rooms[roomId].selectedIndex;
      
      // Clear votes for the current story
      if (rooms[roomId].votesPerStory[currentStoryIndex]) {
        rooms[roomId].votesPerStory[currentStoryIndex] = {};
        
        // Also clear from persistent storage for all users
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

  // Handle story navigation
  socket.on('storyNavigation', ({ index }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      io.to(roomId).emit('storyNavigation', { index });
    }
  });

  // Handle CSV data synchronization
  socket.on('syncCSVData', (csvData) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].csvData = csvData;
      rooms[roomId].selectedIndex = 0; // Reset selected index when new CSV data is loaded
      
      // We don't reset votes when new CSV is loaded to maintain persistence
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
      
      socket.emit('exportData', exportData);
    }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] Client disconnected: ${socket.id} from room ${roomId}`);
      
      // Remove user from room
      rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
      
      // Notify remaining users
      io.to(roomId).emit('userList', rooms[roomId].users);
      
      // Clean up empty rooms
      if (rooms[roomId].users.length === 0) {
        console.log(`[SERVER] Removing empty room: ${roomId}`);
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
