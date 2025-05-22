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

const rooms = {};      // roomId: { users, selectedStoryId, votesPerStory, votesRevealed, tickets }
const roomVotingSystems = {};

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
                selectedStoryId: null,
                votesPerStory: {},
                votesRevealed: {},
                tickets: []
            };
        }

        // Update user list
        rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
        rooms[roomId].users.push({ id: socket.id, name: userName });
        socket.join(roomId);

        const votingSystem = roomVotingSystems[roomId] || 'fibonacci';
        socket.emit('votingSystemUpdate', { votingSystem });

        console.log(`[SERVER] ${userName} (${socket.id}) joined ${roomId}`);

        io.to(roomId).emit('userList', rooms[roomId].users);

        if (rooms[roomId].csvData?.length > 0) {
            socket.emit('syncCSVData', rooms[roomId].csvData);
        }

        // Send selected story ID
        if (rooms[roomId].selectedStoryId) {
            socket.emit('storySelected', { storyId: rooms[roomId].selectedStoryId });
        }

        // Send revealed votes and all tickets
        const votesRevealed = rooms[roomId].votesRevealed || {};
        for (const storyId in votesRevealed) {
            if (votesRevealed[storyId]) {
                const votes = rooms[roomId].votesPerStory[storyId] || {};
                socket.emit('storyVotes', { storyId, votes });
                socket.emit('votesRevealed', { storyId });
            }
        }

        if (rooms[roomId].tickets) {
            socket.emit('allTickets', { tickets: rooms[roomId].tickets });
        }
    });


    socket.on('requestCurrentStory', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].selectedStoryId) {
            console.log(`[SERVER] Sending current story ${rooms[roomId].selectedStoryId} to ${socket.id}`);
            socket.emit('storySelected', { storyId: rooms[roomId].selectedStoryId });
        }
    });

    // Other socket event handlers...

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
        if (roomId && rooms[roomId] && storyId) { // Make sure storyId exists
            const votes = rooms[roomId].votesPerStory[storyId] || {};
            console.log(`[SERVER] Sending votes for story ${storyId} to ${socket.id}:`, votes);
            socket.emit('storyVotes', { storyId, votes });

            if (rooms[roomId].votesRevealed[storyId]) {
                socket.emit('votesRevealed', { storyId });
            }
        }
    });

    socket.on('revealVotes', () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId] || !rooms[roomId].selectedStoryId) return;

        const currentStoryId = rooms[roomId].selectedStoryId;
        rooms[roomId].votesRevealed[currentStoryId] = true;
        io.to(roomId).emit('votesRevealed', { storyId: currentStoryId });

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


    // Other socket event handlers...
    
    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            console.log(`[SERVER] ${socket.id} disconnected from ${roomId}`);
            rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
            io.to(roomId).emit('userList', rooms[roomId].users);

            if (rooms[roomId].users.length === 0) {
                console.log(`[SERVER] Removing empty room: ${roomId}`);
                delete rooms[roomId];
                delete roomVotingSystems[roomId];
            }
        }
    });
});


const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
