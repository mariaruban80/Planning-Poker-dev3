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

// Static file serving and routes
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'main.html'));
});
app.use(express.static(join(__dirname, 'public')));

// Enhanced room structure with vote revealing state
const rooms = {}; // roomId: { users, votes, story, revealed, csvData, tickets, selectedIndex, selectedStoryId, votesPerStory, votesRevealed }

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
        tickets: [],
        selectedIndex: 0,
        selectedStoryId: null, // Add this new field
        votesPerStory: {},
        votesRevealed: {}
      };
      console.log(`[SERVER] Created new room: ${roomId}`);
    }

    // Remove existing user entry if present (by socket ID)
    rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
    
    // Add new user entry with username
    rooms[roomId].users.push({ id: socket.id, name: userName });
    socket.join(roomId);

    console.log(`[SERVER] User ${userName} (${socket.id}) joined room ${roomId}`);
    console.log(`[SERVER] Room ${roomId} now has ${rooms[roomId].users.length} users:`, 
      rooms[roomId].users.map(u => `${u.name} (${u.id})`).join(', '));
    
    // Send user list to everyone in the room
    io.to(roomId).emit('userList', rooms[roomId].users);

    // Send CSV data if available
    if (rooms[roomId].csvData?.length > 0) {
      socket.emit('syncCSVData', rooms[roomId].csvData);
    }
    
    // Send current story selection to the new user using ID if available
    if (rooms[roomId].selectedStoryId) {
      console.log(`[SERVER] Sending selected story ID to new user: ${rooms[roomId].selectedStoryId}`);
      socket.emit('storySelectedById', { 
        storyId: rooms[roomId].selectedStoryId,
        isInitialSync: true 
      });
    } else if (typeof rooms[roomId].selectedIndex === 'number') {
      // Fall back to index-based selection if no ID is available
      const storyIndex = rooms[roomId].selectedIndex;
      console.log(`[SERVER] Sending selected story index to new user: ${storyIndex}`);
      socket.emit('storySelected', { 
        storyIndex,
        isInitialSync: true 
      });
    }
  });
  // Add this to server.js
socket.on('syncCurrentSelection', () => {
  const roomId = socket.data.roomId;
  if (roomId && rooms[roomId]) {
    console.log(`[SERVER] Client ${socket.id} requested selection sync. Broadcasting selected storyId: ${rooms[roomId].selectedStoryId}`);
    
    // Send the current selection to everyone in the room to ensure consistency
    io.to(roomId).emit('forceSelectionSync', { 
      storyId: rooms[roomId].selectedStoryId,
      storyIndex: rooms[roomId].selectedIndex,
      forcedSync: true
    });
  }
});
  // Handle requesting user list explicitly
  socket.on('requestUserList', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] User ${socket.id} requested user list for room ${roomId}`);
      console.log(`[SERVER] Sending list of ${rooms[roomId].users.length} users`);
      
      // Send the user list directly to the requesting client
      socket.emit('userList', rooms[roomId].users);
    }
  });
  
  // Handle requesting current story selection
  socket.on('requestCurrentStory', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      // Prefer ID-based selection if available
      if (rooms[roomId].selectedStoryId) {
        console.log(`[SERVER] Client ${socket.id} requested current story, sending ID: ${rooms[roomId].selectedStoryId}`);
        socket.emit('storySelectedById', { 
          storyId: rooms[roomId].selectedStoryId,
          isInitialSync: true
        });
      } else {
        // Fall back to index-based selection
        const currentStoryIndex = rooms[roomId].selectedIndex || 0;
        console.log(`[SERVER] Client ${socket.id} requested current story, sending index: ${currentStoryIndex}`);
        socket.emit('storySelected', { 
          storyIndex: currentStoryIndex,
          isInitialSync: true
        });
      }
    }
  });
  
  // Add a new handler for story selection by ID
  socket.on('storySelectedById', ({ storyId }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] Story selection by ID received from ${socket.id} (${socket.data.userName}) in room ${roomId}, storyId: ${storyId}`);
      
      // Store the selected story ID in room state
      rooms[roomId].selectedStoryId = storyId;
      
      // Try to find the corresponding index for backward compatibility
      if (rooms[roomId].tickets && Array.isArray(rooms[roomId].tickets)) {
        const index = rooms[roomId].tickets.findIndex(t => t.id === storyId);
        if (index !== -1) {
          rooms[roomId].selectedIndex = index;
          console.log(`[SERVER] Found corresponding index ${index} for storyId ${storyId}`);
        }
      }
      
      // Broadcast to ALL clients in the room
      io.to(roomId).emit('storySelectedById', { 
        storyId: storyId,
        selectorId: socket.id,
        selectorName: socket.data.userName
      });
    }
  });

  // Handle ticket synchronization
  socket.on('addTicket', (ticketData) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] New ticket added to room ${roomId}: ${ticketData.id}`);
      
      // Initialize tickets array if needed
      if (!rooms[roomId].tickets) {
        rooms[roomId].tickets = [];
      }
      
      // Check if ticket already exists to avoid duplicates
      const existingIndex = rooms[roomId].tickets.findIndex(t => t.id === ticketData.id);
      if (existingIndex === -1) {
        // Add new ticket
        rooms[roomId].tickets.push(ticketData);
        
        // Broadcast the new ticket to everyone in the room EXCEPT sender
        socket.broadcast.to(roomId).emit('addTicket', { ticketData });
      } else {
        console.log(`[SERVER] Ticket ${ticketData.id} already exists, not adding duplicate`);
      }
    }
  });

  // Add handler for getting all tickets
  socket.on('requestAllTickets', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId] && rooms[roomId].tickets) {
      console.log(`[SERVER] Sending all tickets to client ${socket.id}`);
      socket.emit('allTickets', { tickets: rooms[roomId].tickets });
    }
  });

  // Handle CSV data loaded confirmation
  socket.on('csvDataLoaded', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      // Now that CSV is loaded, send the current story selection
      if (rooms[roomId].selectedStoryId) {
        // Prefer ID-based selection
        socket.emit('storySelectedById', { 
          storyId: rooms[roomId].selectedStoryId,
          isInitialSync: true
        });
      } else if (typeof rooms[roomId].selectedIndex === 'number') {
        // Fall back to index-based selection
        const storyIndex = rooms[roomId].selectedIndex;
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

  // Update the old index-based handler to set the ID too
  socket.on('storySelected', ({ storyIndex }) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      console.log(`[SERVER] Story selection by index received from ${socket.id} (${socket.data.userName}) in room ${roomId}, index: ${storyIndex}`);
      
      // Store the selected index in room state
      rooms[roomId].selectedIndex = storyIndex;
      
      // Find the story ID that corresponds to this index if possible
      let selectedStoryId = null;
      if (rooms[roomId].tickets && Array.isArray(rooms[roomId].tickets) && 
          storyIndex >= 0 && storyIndex < rooms[roomId].tickets.length) {
        selectedStoryId = rooms[roomId].tickets[storyIndex].id;
        rooms[roomId].selectedStoryId = selectedStoryId;
        console.log(`[SERVER] Found story ID ${selectedStoryId} for index ${storyIndex}`);
      }
      
      // Broadcast to ALL clients in the room
      io.to(roomId).emit('storySelected', { 
        storyIndex,
        storyId: selectedStoryId,
        userId: socket.id,
        userName: socket.data.userName
      });
    }
  });

  // Handle user votes
  socket.on('castVote', ({ vote, targetUserId }) => {
    const roomId = socket.data.roomId;
    if (roomId && targetUserId != null && rooms[roomId]) {
      const currentStoryIndex = rooms[roomId].selectedIndex;

      // Initialize vote storage for this story if needed
      if (!rooms[roomId].votesPerStory[currentStoryIndex]) {
        rooms[roomId].votesPerStory[currentStoryIndex] = {};
      }

      // Store the vote
      rooms[roomId].votesPerStory[currentStoryIndex][targetUserId] = vote;

      // Broadcast vote to all clients in the room
      io.to(roomId).emit('voteUpdate', {
        userId: targetUserId,
        vote,
        storyIndex: currentStoryIndex
      });
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
      // Store the raw CSV data
      rooms[roomId].csvData = csvData;
      
      // Initialize tickets array if needed
      if (!rooms[roomId].tickets) {
        rooms[roomId].tickets = [];
      }
      
      // Get existing manual tickets (non-CSV tickets)
      const manualTickets = rooms[roomId].tickets.filter(t => 
        t.id && !t.id.includes('story_csv_'));
      
      // Create new tickets array with manual tickets preserved
      rooms[roomId].tickets = [...manualTickets];
      
      // Add new CSV tickets
      csvData.forEach((row, index) => {
        const ticketText = Array.isArray(row) ? row.join(' | ') : row;
        rooms[roomId].tickets.push({
          id: `story_csv_${index}`,
          text: ticketText
        });
      });
      
      // Reset selected index and story ID
      rooms[roomId].selectedIndex = 0;
      if (rooms[roomId].tickets.length > 0) {
        rooms[roomId].selectedStoryId = rooms[roomId].tickets[0].id;
      } else {
        rooms[roomId].selectedStoryId = null;
      }
      
      // Reset voting state
      rooms[roomId].votesPerStory = {}; 
      rooms[roomId].votesRevealed = {};
      
      // Broadcast updated CSV data
      io.to(roomId).emit('syncCSVData', csvData);
      
      // Also broadcast all tickets to ensure consistency
      io.to(roomId).emit('allTickets', { tickets: rooms[roomId].tickets });
      
      console.log(`[SERVER] CSV data synced for room ${roomId}. Total tickets: ${rooms[roomId].tickets.length}`);
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
