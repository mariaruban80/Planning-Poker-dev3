const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Socket.io logic
let users = [];

io.on('connection', socket => {
  console.log('New client connected:', socket.id);

  socket.on('addUser', name => {
    const user = { id: socket.id, name };
    users.push(user);
    io.emit('updateUsers', users);
  });

  socket.on('vote', ({ user, story, value }) => {
    io.emit('userVoted', { user, story, value });
  });

  socket.on('revealVotes', () => {
    io.emit('revealVotes');
  });

  socket.on('resetVotes', () => {
    io.emit('resetVotes');
  });

  socket.on('disconnect', () => {
    users = users.filter(u => u.id !== socket.id);
    io.emit('updateUsers', users);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
