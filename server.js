// server.js
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {}; // roomId -> { users: Set, sockets: Set }

function broadcastToRoom(roomId, data) {
  if (!rooms[roomId]) return;
  rooms[roomId].sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentUser = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'join') {
        const { roomId, user } = msg;
        currentRoom = roomId;
        currentUser = user;

        if (!rooms[roomId]) {
          rooms[roomId] = { users: new Set(), sockets: new Set() };
        }

        rooms[roomId].users.add(user);
        rooms[roomId].sockets.add(ws);

        broadcastToRoom(roomId, {
          type: 'userList',
          users: Array.from(rooms[roomId].users),
        });

      } else if (msg.type === 'voteUpdate') {
        broadcastToRoom(currentRoom, {
          type: 'voteUpdate',
          story: msg.story,
          votes: msg.votes,
        });

      } else if (msg.type === 'storyChange') {
        broadcastToRoom(currentRoom, {
          type: 'storyChange',
          story: msg.story,
          index: msg.index,
        });
      }

    } catch (err) {
      console.error('Invalid message:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].users.delete(currentUser);
      rooms[currentRoom].sockets.delete(ws);

      broadcastToRoom(currentRoom, {
        type: 'userList',
        users: Array.from(rooms[currentRoom].users),
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
