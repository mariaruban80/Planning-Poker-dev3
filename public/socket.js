// socket.js

let socket;

// Function to initialize WebSocket connection
export const initializeWebSocket = (currentRoomId) => {
  socket = new WebSocket(`wss://your-backend-url.onrender.com`); // Replace with your actual URL

  socket.onopen = () => {
    const userId = "User" + Math.floor(Math.random() * 10000);

    socket.send(JSON.stringify({
      type: "join",
      user: userId,
      roomId: currentRoomId
    }));

    console.log('✅ Connected to WebSocket as', userId);
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'update') {
      console.log('📩 Received update:', message);
      // Handle UI updates here
    }
  };

  socket.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
  };

  socket.onclose = () => {
    console.log('🔌 WebSocket connection closed');
  };
};

// Export the socket to use elsewhere
export const getSocket = () => socket;
