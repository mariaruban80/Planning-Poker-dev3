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
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 30000,
  maxHttpBufferSize: 1e6
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'main.html'));
});

// === Room and user tracking ===
const rooms = {};
const roomVotingSystems = {};
const userConnections = {};
const ROOM_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
const INACTIVE_ROOM_THRESHOLD = 12 * 60 * 60 * 1000;
setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL);

function updateRoomActivity(roomId) {
  if (rooms[roomId]) {
    rooms[roomId].lastActivity = Date.now();
  }
}

function cleanupInactiveRooms() {
  const now = Date.now();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.lastActivity && (now - room.lastActivity > INACTIVE_ROOM_THRESHOLD)) {
      delete rooms[roomId];
      delete roomVotingSystems[roomId];
    }
  }
}

// === Socket.io connection ===
io.on('connection', (socket) => {
  console.log(`[SERVER] New client connected: ${socket.id}`);
  socket.data = {};

  socket.on('ping', () => {
    socket.emit('pong');
    const roomId = socket.data.roomId;
    if (roomId) updateRoomActivity(roomId);
    const userId = socket.data.userName;
    if (userId && userConnections[userId]) userConnections[userId].lastPing = Date.now();
  });

  socket.on('joinRoom', ({ roomId, userName, votingSystem }) => {
    if (!userName) {
      socket.emit('error', { message: 'Username is required' });
      return;
    }

    socket.data.roomId = roomId;
    socket.data.userName = userName;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        votesPerStory: {},
        votesRevealed: {},
        csvData: [],
        selectedIndex: 0,
        tickets: [],
        lastActivity: Date.now()
      };
    }

    rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
    rooms[roomId].users.push({ id: socket.id, name: userName });
    socket.join(roomId);

    if (!userConnections[userName]) {
      userConnections[userName] = { connectionCount: 1, lastPing: Date.now() };
    } else {
      userConnections[userName].connectionCount++;
      userConnections[userName].lastPing = Date.now();
    }

    if (votingSystem && (!roomVotingSystems[roomId] || votingSystem === 'host')) {
      roomVotingSystems[roomId] = votingSystem;
    }

    updateRoomActivity(roomId);
    io.to(roomId).emit('userList', rooms[roomId].users);
  });

  socket.on('storySelected', ({ storyIndex }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    rooms[roomId].selectedIndex = storyIndex;
    updateRoomActivity(roomId);
    io.to(roomId).emit('storySelected', { storyIndex });
  });

  socket.on('castVote', ({ vote, targetUserId, storyId }) => {
    const roomId = socket.data.roomId;
    const voterName = socket.data.userName;
    if (!rooms[roomId] || targetUserId !== voterName) return;

    if (!rooms[roomId].votesPerStory[storyId]) {
      rooms[roomId].votesPerStory[storyId] = {};
    }
    rooms[roomId].votesPerStory[storyId][voterName] = vote;

    updateRoomActivity(roomId);
    io.to(roomId).emit('voteUpdate', { userId: voterName, vote, storyId });
  });

  socket.on('revealVotes', ({ storyId }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    rooms[roomId].votesRevealed[storyId] = true;
    updateRoomActivity(roomId);
    io.to(roomId).emit('votesRevealed', { storyId });
  });

  socket.on('resetVotes', ({ storyId }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    rooms[roomId].votesPerStory[storyId] = {};
    rooms[roomId].votesRevealed[storyId] = false;
    updateRoomActivity(roomId);
    io.to(roomId).emit('votesReset', { storyId });
  });

  socket.on('requestStoryVotes', ({ storyId }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;

    const votes = rooms[roomId].votesPerStory[storyId] || {};
    socket.emit('storyVotes', { storyId, votes });

    if (rooms[roomId].votesRevealed[storyId]) {
      socket.emit('votesRevealed', { storyId });
    }

    updateRoomActivity(roomId);
  });

  socket.on('removeTicket', ({ storyId }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;

    const room = rooms[roomId];
    const storyIndex = room.tickets.findIndex(ticket => ticket.id === storyId);
    room.tickets = room.tickets.filter(ticket => ticket.id !== storyId);
    delete room.votesPerStory[storyId];
    delete room.votesRevealed[storyId];

    if (room.tickets.length === 0) {
      room.selectedIndex = null;
      io.to(roomId).emit('allStoriesCleared');
    } else if (storyIndex === room.selectedIndex) {
      room.selectedIndex = 0;
      io.to(roomId).emit('storySelected', { storyIndex: 0 });
    }

    io.to(roomId).emit('ticketRemoved', { storyId });
    io.to(roomId).emit('votesReset', { storyId });
  });

  socket.on('addTicket', (ticketData) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    rooms[roomId].tickets.push(ticketData);

    // Auto-select first story
    if (rooms[roomId].tickets.length === 1 || rooms[roomId].selectedIndex == null) {
      rooms[roomId].selectedIndex = 0;
      io.to(roomId).emit('storySelected', { storyIndex: 0 });
    }

    updateRoomActivity(roomId);
    io.to(roomId).emit('addTicket', { ticketData });
  });

  socket.on('requestAllTickets', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    socket.emit('allTickets', { tickets: rooms[roomId].tickets });
    updateRoomActivity(roomId);
  });

  socket.on('syncCSVData', (csvData) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    rooms[roomId].csvData = csvData;
    rooms[roomId].tickets = csvData.map((row, i) => ({
      id: `story_csv_${i}`,
      text: Array.isArray(row) ? row.join(' | ') : String(row)
    }));
    rooms[roomId].votesPerStory = {};
    rooms[roomId].votesRevealed = {};
    rooms[roomId].selectedIndex = 0;
    io.to(roomId).emit('syncCSVData', csvData);
  });

  socket.on('exportVotes', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;

    const exportData = {
      room: roomId,
      stories: rooms[roomId].csvData,
      votes: rooms[roomId].votesPerStory,
      revealed: rooms[roomId].votesRevealed,
      timestamp: new Date().toISOString()
    };

    updateRoomActivity(roomId);
    socket.emit('exportData', exportData);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const userName = socket.data.userName;
    if (!rooms[roomId]) return;

    rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
    updateRoomActivity(roomId);
    io.to(roomId).emit('userList', rooms[roomId].users);

    if (userConnections[userName]) {
      userConnections[userName].connectionCount--;
      if (userConnections[userName].connectionCount <= 0) {
        delete userConnections[userName];
      }
    }

    if (rooms[roomId].users.length === 0) {
      delete rooms[roomId];
      delete roomVotingSystems[roomId];
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
