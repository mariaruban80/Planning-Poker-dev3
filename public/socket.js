// socket.js

let socket;
const socket = io(window.location.origin);

// Optional: Log connection success and errors
socket.on('connect', () => {
  console.log('Connected to WebSocket:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('WebSocket connection error:', err);
});


// Function to initialize WebSocket connection
export const initializeWebSocket = (currentRoomId) => {
  socket = new WebSocket(`wss://<your-server-url>`);

  // When the socket connection is established
  socket.onopen = () => {
    // Generate a random user ID
    const userId = "User" + Math.floor(Math.random() * 10000);

    // Send a "join" message with the user ID and room ID to the server
    socket.send(JSON.stringify({
      type: "join",
      user: userId,
      roomId: currentRoomId  // Ensure currentRoomId is defined in your app
    }));
  };

  // Handling incoming messages from the WebSocket server
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    // Handle different types of messages based on your app logic
    if (message.type === 'update') {
      // Update the UI or handle specific updates
    }
  };

  // Handle socket errors
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  // Handle socket closure
  socket.onclose = () => {
    console.log('WebSocket connection closed');
  };
};

// Export the socket to use in other parts of the app if needed
export const getSocket = () => socket;
