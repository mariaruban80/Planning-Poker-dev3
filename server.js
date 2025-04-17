// server.js
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

const rooms = {};

server.on('connection', socket => {
  let roomId, username;

  socket.on('message', message => {
    const data = JSON.parse(message);
    if (data.type === 'join') {
      roomId = data.roomId;
      username = data.user;
      rooms[roomId] = rooms[roomId] || [];
      rooms[roomId].push({ socket, user: username });
      broadcastUserList();
    }
  });

  socket.on('close', () => {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(u => u.socket !== socket);
      broadcastUserList();
    }
  });

  function broadcastUserList() {
    const users = rooms[roomId]?.map(u => u.user);
    rooms[roomId]?.forEach(u => {
      u.socket.send(JSON.stringify({ type: 'userList', users }));
    });
  }
});
