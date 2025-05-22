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
    connectTimeout: 10000
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'main.html'));
});
app.use(express.static(join(__dirname, 'public')));

const rooms = {};      // roomId: { users, selectedStoryId, votesPerStory, votesRevealed, tickets, csvData, selectedIndex }
const roomVotingSystems = {}; // roomId → voting system


io.on('connection', (socket) => {
    console.log(`[SERVER] New client connected: ${socket.id}`);

    socket.on('joinRoom', ({ roomId, userName }) => {
        if (!userName) {
            console.log(`[SERVER] Rejected connection without username: ${socket.id}`);
            socket.emit('error', { message: 'Username is required.' });
            return;
        }

        socket.data.roomId = roomId;
        socket.data.userName = userName;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                selectedStoryId: null, // Use storyId, initialize to null
                votesPerStory: {},     // votes by storyId
                votesRevealed: {},     // revealed status by storyId
                tickets: [],          // Manually added tickets
                csvData: [],          // Preserving csvData functionality
                selectedIndex: 0      // Preserving selectedIndex for backward compatibility
            };
        }

        // Update user list and broadcast it
        rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
        rooms[roomId].users.push({ id: socket.id, name: userName });
        socket.join(roomId);
        io.to(roomId).emit('userList', rooms[roomId].users);  // Broadcast updated userList


        const votingSystem = roomVotingSystems[roomId] || 'fibonacci';
        socket.emit('votingSystemUpdate', { votingSystem });

        console.log(`[SERVER] ${userName} (${socket.id}) joined ${roomId}`);

        if (rooms[roomId].csvData?.length > 0) {
            socket.emit('syncCSVData', rooms[roomId].csvData);
        }

        // Send selected story ID
        if (rooms[roomId].selectedStoryId) {
            socket.emit('storySelected', { storyId: rooms[roomId].selectedStoryId });
        }

        // Send revealed votes and all tickets using story IDs
        const votesRevealed = rooms[roomId].votesRevealed || {};

        for (const storyId in votesRevealed) {
            if (votesRevealed[storyId]) {
                socket.emit('votesRevealed', { storyId });
            }
        }
        for (const storyId in rooms[roomId].votesPerStory) {
                socket.emit('storyVotes', { storyId, votes: rooms[roomId].votesPerStory[storyId] || {} });
        }


        if (rooms[roomId].tickets) {
            socket.emit('allTickets', { tickets: rooms[roomId].tickets });
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            console.log(`[SERVER] ${socket.id} disconnected from ${roomId}`);
            rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);

            // Broadcast updated user list
            io.to(roomId).emit('userList', rooms[roomId].users);

            if (rooms[roomId].users.length === 0) {
                console.log(`[SERVER] Removing empty room: ${roomId}`);
                delete rooms[roomId];
                delete roomVotingSystems[roomId];
            }
        }
    });

    socket.on('requestCurrentStory', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            const currentStoryId = rooms[roomId].selectedStoryId || null; // Default to null if no story selected yet.
            socket.emit('storySelected', { storyId: currentStoryId });
        }
    });

    socket.on('requestUserList', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
        socket.emit('userList', rooms[roomId].users);
    }
});


    socket.on('storySelected', ({ storyId }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            console.log(`[SERVER] Story ${storyId} selected by ${socket.data.userName} in ${roomId}`);
            rooms[roomId].selectedStoryId = storyId;
            io.to(roomId).emit('storySelected', { storyId });
        }
    });

    socket.on('castVote', ({ vote, targetUserId, storyId }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId] && targetUserId === socket.id) {
            const currentStoryId = storyId || rooms[roomId].selectedStoryId;
            if (!currentStoryId) return;


            console.log(`[SERVER] ${socket.data.userName} voted '${vote}' for story ${currentStoryId}`);

            if (!rooms[roomId].votesPerStory[currentStoryId]) {
                rooms[roomId].votesPerStory[currentStoryId] = {};
            }
            rooms[roomId].votesPerStory[currentStoryId][targetUserId] = vote;
            io.to(roomId).emit('voteUpdate', { userId: targetUserId, vote, storyId: currentStoryId });
        }
    });

    socket.on('requestStoryVotes', ({ storyId }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId] && storyId) {
            const votes = rooms[roomId].votesPerStory[storyId] || {};
            console.log(`[SERVER] Sending votes for story ${storyId} to ${socket.id}:`, votes);
            socket.emit('storyVotes', { storyId, votes });

            if (rooms[roomId].votesRevealed && rooms[roomId].votesRevealed[storyId]) {
                socket.emit('votesRevealed', { storyId });
            }
        }
    });

    // Reveal Votes
    socket.on('revealVotes', () => {
        const roomId = socket.data.roomId;

        if (!roomId || !rooms[roomId] || !rooms[roomId].selectedStoryId) return;

        const currentStoryId = rooms[roomId].selectedStoryId;
        rooms[roomId].votesRevealed[currentStoryId] = true;

        // Include votes in the 'votesRevealed' event
        const votes = rooms[roomId].votesPerStory[currentStoryId] || {};
        io.to(roomId).emit('votesRevealed', { storyId: currentStoryId, votes });

        console.log(`[SERVER] Votes revealed for story ${currentStoryId} in ${roomId}`);
    });



    socket.on('resetVotes', () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId] || !rooms[roomId].selectedStoryId) return;

        const currentStoryId = rooms[roomId].selectedStoryId;

        if (rooms[roomId].votesPerStory[currentStoryId]) {
            rooms[roomId].votesPerStory[currentStoryId] = {};
            rooms[roomId].votesRevealed[currentStoryId] = false;

            console.log(`[SERVER] Votes reset for story ${currentStoryId} in ${roomId}`);
            io.to(roomId).emit('votesReset', { storyId: currentStoryId });
        }
    });

    socket.on('addTicket', (ticketData) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            console.log(`[SERVER] New ticket added to room ${roomId}`);
            socket.to(roomId).emit('addTicket', { ticketData }); // broadcast to room, excluding sender

            if (!rooms[roomId].tickets) {
                rooms[roomId].tickets = [];
            }
            rooms[roomId].tickets.push(ticketData);
        }
    });

    socket.on('deleteStory', ({ storyId, isCsvStory, csvIndex }) => {
        const roomId = socket.data.roomId;

        if (roomId && rooms[roomId]) {
            console.log(`[SERVER] Story deleted in room ${roomId}: ${storyId}`);

            if (isCsvStory && rooms[roomId].csvData) {
                if (!isNaN(csvIndex) && csvIndex >= 0 && csvIndex < rooms[roomId].csvData.length) {
                    rooms[roomId].csvData.splice(csvIndex, 1);
                    io.to(roomId).emit('syncCSVData', rooms[roomId].csvData);
                }
            }

            if (rooms[roomId].tickets) {
                rooms[roomId].tickets = rooms[roomId].tickets.filter(ticket => ticket.id !== storyId);
            }

            // Broadcast deletion
            socket.broadcast.to(roomId).emit('deleteStory', { storyId });
            
            // Handle selected story deletion - reset selectedStoryId if it matches
            if (storyId === rooms[roomId].selectedStoryId) {
                rooms[roomId].selectedStoryId = null; // Reset if currently selected story has been deleted.
            }
        }
    });    

    socket.on('votingSystemSelected', ({ roomId, votingSystem }) => {
        if (roomId && votingSystem) {
            roomVotingSystems[roomId] = votingSystem;
            io.to(roomId).emit('votingSystemUpdate', { votingSystem }); // broadcast update
        }
    });

    socket.on('syncCSVData', (csvData) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            rooms[roomId].csvData = csvData;
            rooms[roomId].selectedIndex = 0;
            rooms[roomId].votesPerStory = {};
            rooms[roomId].votesRevealed = {};
            rooms[roomId].selectedStoryId = null;  // Ensure selected Story ID is reset to null after upload

            io.to(roomId).emit('syncCSVData', csvData); // Broadcast to whole room
        }
    });

    socket.on('csvDataLoaded', () => {
      const roomId = socket.data.roomId;
      if (roomId && rooms[roomId]) {

          // Now that CSV is loaded, send the current story selection (if any)
          if (rooms[roomId].selectedStoryId !== null) {
              const selectedStoryId = rooms[roomId].selectedStoryId;
              console.log(`[SERVER] Client ${socket.id} confirmed CSV loaded, sending current story Selection ${selectedStoryId}`);

              socket.emit('storySelected', { storyId: selectedStoryId });
          }
      }
  });    

    // Add request all tickets handler
    socket.on('requestAllTickets', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].tickets) {
            console.log(`[SERVER] Sending all tickets (${rooms[roomId].tickets.length}) to ${socket.id}`);
            socket.emit('allTickets', { tickets: rooms[roomId].tickets });
        }
    });

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
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
