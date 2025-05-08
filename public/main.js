// Get username from sessionStorage (already set from main.html or by index.html prompt)
let userName = sessionStorage.getItem('userName');
let processingCSVData = false;
// Import socket functionality
import { initializeWebSocket, emitCSVData, requestStoryVotes, emitAddTicket, requestUserList, emitStorySelected, emitStorySelectedById } from './socket.js'; 

// Flag to track manually added tickets that need to be preserved
let preservedManualTickets = [];

// Debug mode flag
let DEBUG_MODE = false;

// Add a window function for index.html to call
window.notifyStoriesUpdated = function() {
  const storyList = document.getElementById('storyList');
  if (!storyList) return;
  
  // Collect current stories from DOM
  const allTickets = [];
  const storyCards = storyList.querySelectorAll('.story-card');
  
  storyCards.forEach((card, index) => {
    const titleElement = card.querySelector('.story-title');
    if (titleElement) {
      allTickets.push({
        id: card.id,
        text: titleElement.textContent
      });
    }
  });
  
  // Update our manually added tickets tracker
  preservedManualTickets = allTickets.filter(ticket => 
    ticket.id && !ticket.id.includes('story_csv_')
  );
  
  console.log(`Preserved ${preservedManualTickets.length} manual tickets`);
};

/**
 * Handle adding a ticket from the modal
 * @param {Object} ticketData - Ticket data {id, text}
 */
window.addTicketFromModal = function(ticketData) {
  if (!ticketData || !ticketData.id || !ticketData.text) return;
  
  console.log('[MODAL] Adding ticket from modal:', ticketData);
  
  // Emit to server for synchronization
  if (typeof emitAddTicket === 'function') {
    emitAddTicket(ticketData);
  } else if (socket) {
    socket.emit('addTicket', ticketData);
  }
  
  // Add ticket locally
  addTicketToUI(ticketData, true);
  
  // Store in manually added tickets
  manuallyAddedTickets.push(ticketData);
};

/**
 * Initialize socket with a specific name (used when joining via invite)
 * @param {string} roomId - Room ID to join 
 * @param {string} name - Username to use
 */
window.initializeSocketWithName = function(roomId, name) {
  if (!roomId || !name) {
    console.error('[APP] Cannot initialize: missing roomId or username');
    return;
  }
  
  console.log(`[APP] Initializing socket with name: ${name} for room: ${roomId}`);
  
  // Set username in the module scope
  userName = name;
  
  // Initialize socket with the name
  socket = initializeWebSocket(roomId, name, handleSocketMessage);
  
  // Add a manual user list update with just the current user
  // This ensures there's at least one user visible while waiting for server
  setTimeout(() => {
    // Create a temporary user entry with the current user
    const tempUserList = [
      { id: 'local-user', name: name }
    ];
    
    // Update UI with this temporary user
    updateUserList(tempUserList);
    
    console.log('[APP] Added temporary local user to user list');
  }, 100);
  
  // Request all tickets and force user list refresh after a delay
  setTimeout(() => {
    if (socket && socket.connected) {
      console.log('[APP] Requesting all tickets after initialization');
      socket.emit('requestAllTickets');
      
      // Explicitly request the current user list
      if (typeof requestUserList === 'function') {
        requestUserList();
      } else if (socket.emit) {
        socket.emit('requestUserList');
      }
      
      // Request current story selection
      socket.emit('requestCurrentStory');
      
      hasRequestedTickets = true; // Set flag to avoid duplicate requests
    }
  }, 1000);
  
  // Continue with other initialization steps
  setupCSVUploader();
  setupInviteButton();
  setupStoryNavigation();
  setupVoteCardsDrag();
  setupRevealResetButtons();
  setupAddTicketButton();
  setupGuestModeRestrictions();
  
  // Add CSS for new layout
  addNewLayoutStyles();
};

// Modify the existing DOMContentLoaded event handler to check if username is ready
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're waiting for a username (joining via invite)
  if (window.userNameReady === false) {
    console.log('[APP] Waiting for username before initializing app');
    return; // Exit early, we'll initialize after username is provided
  }
  
  // Normal initialization for users who already have a name
  let roomId = getRoomIdFromURL();
  if (!roomId) {
    roomId = 'room-' + Math.floor(Math.random() * 10000);
  }
  appendRoomIdToURL(roomId);
  initializeApp(roomId);
});

// Global state variables
let pendingStoryIndex = null;
let csvData = [];
let currentStoryIndex = 0;
let currentStoryId = null;  // Add tracking for current story ID
let userVotes = {};
let socket = null;
let csvDataLoaded = false;
let votesPerStory = {};     // Track votes for each story { storyIndex: { userId: vote, ... }, ... }
let votesRevealed = {};     // Track which stories have revealed votes { storyIndex: boolean }
let manuallyAddedTickets = []; // Track tickets added manually
let hasRequestedTickets = false; // Flag to track if we've already requested tickets
let ignoreNextStorySelection = false; // Flag to prevent loopback selections
let processingRemoteSelection = false; // Flag to prevent processing a remote selection while rendering

/**
 * Determines if current user is a guest
 */
function isGuestUser() {
  // Check if URL contains 'roomId' parameter but not 'host=true'
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('roomId') && !urlParams.has('host');
}

/**
 * Set up guest mode restrictions
 */
function setupGuestModeRestrictions() {
  if (isGuestUser()) {
    // Hide sidebar control buttons
    const revealVotesBtn = document.getElementById('revealVotesBtn');
    const resetVotesBtn = document.getElementById('resetVotesBtn');
    if (revealVotesBtn) revealVotesBtn.classList.add('hide-for-guests');
    if (resetVotesBtn) resetVotesBtn.classList.add('hide-for-guests');
    
    // Hide upload ticket button
    const fileInputContainer = document.getElementById('fileInputContainer');
    if (fileInputContainer) fileInputContainer.classList.add('hide-for-guests');
    
    // Hide add ticket button
    const addTicketBtn = document.getElementById('addTicketBtn');
    if (addTicketBtn) addTicketBtn.classList.add('hide-for-guests');
    
    console.log('Guest mode activated - voting controls restricted');
  }
}

/**
 * Extract room ID from URL parameters
 */
function getRoomIdFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId');
  
  if (roomId) {
    return roomId;
  } else {
    // If no roomId in URL, generate a new one (fallback behavior)
    return 'room-' + Math.floor(Math.random() * 10000);
  }
}

/**
 * Append room ID to URL if not already present
 */
function appendRoomIdToURL(roomId) {
  // Only modify URL if roomId isn't already in the URL
  if (!window.location.href.includes('roomId=')) {
    const newUrl = window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'roomId=' + roomId;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }
}

/**
 * Initialize the application
 */
function initializeApp(roomId) {
  // Initialize socket with userName from sessionStorage
  socket = initializeWebSocket(roomId, userName, handleSocketMessage);
  
  setupCSVUploader();
  setupInviteButton();
  setupStoryNavigation();
  setupVoteCardsDrag();
  setupRevealResetButtons();
  setupAddTicketButton();
  setupGuestModeRestrictions(); // Add guest mode restrictions
  
  // Add CSS for new layout
  addNewLayoutStyles();
}

/**
 * Add CSS styles for the new layout
 */
function addNewLayoutStyles() {
  // Existing function - unchanged
}

/**
 * Setup Add Ticket button
 */
function setupAddTicketButton() {
  // Existing function - unchanged
}

/**
 * Add a ticket to the UI
 * @param {Object} ticketData - Ticket data { id, text }
 * @param {boolean} selectAfterAdd - Whether to select the ticket after adding
 */
function addTicketToUI(ticketData, selectAfterAdd = false) {
  if (!ticketData || !ticketData.id || !ticketData.text) return;
  
  const storyList = document.getElementById('storyList');
  if (!storyList) return;
  
  // Check if this ticket already exists (to avoid duplicates)
  const existingTicket = document.getElementById(ticketData.id);
  if (existingTicket) return;
  
  // Create new story card
  const storyCard = document.createElement('div');
  storyCard.className = 'story-card';
  storyCard.id = ticketData.id;
  
  // Set data index attribute (for selection)
  const newIndex = storyList.children.length;
  storyCard.dataset.index = newIndex;
  
  // Create the story title element
  const storyTitle = document.createElement('div');
  storyTitle.className = 'story-title';
  storyTitle.textContent = ticketData.text;
  
  // Add to DOM
  storyCard.appendChild(storyTitle);
  storyList.appendChild(storyCard);
  
  // Add click event listener using ID-based selection
  storyCard.addEventListener('click', () => {
    selectStoryById(ticketData.id); // Use ID-based selection
  });
  
  // Select the new story if requested
  if (selectAfterAdd) {
    selectStoryById(ticketData.id);
  }
  
  // Add this ticket to csvData if not already there
  if (!Array.isArray(csvData)) {
    csvData = [];
  }
  
  // Check if this ticket is already in csvData
  const existingIndex = csvData.findIndex(row => 
    row.length > 0 && row[0] === ticketData.text);
  
  if (existingIndex === -1) {
    csvData.push([ticketData.text]);
  }
  
  // Check for stories message
  updateStoriesVisibility();
}

/**
 * Process multiple tickets at once (used when receiving all tickets from server)
 * @param {Array} tickets - Array of ticket data objects
 */
function processAllTickets(tickets) {
  if (!Array.isArray(tickets) || tickets.length === 0) return;
  
  console.log('[INFO] Processing all tickets received from server:', tickets.length);
  
  // Clear the story list first
  const storyList = document.getElementById('storyList');
  if (storyList) {
    storyList.innerHTML = '';
  }
  
  // Reset csvData
  csvData = [];
  
  // Add all tickets to the UI
  tickets.forEach((ticket, index) => {
    // Only add if it has required properties
    if (ticket && ticket.id && ticket.text) {
      // Add to UI without selecting
      addTicketToUI(ticket, false);
      // If this is a CSV ticket (ID contains "csv"), also add to csvData
      if (ticket.id.includes('csv')) {
        csvData.push([ticket.text]);
      }
    }
  });
  
  // Select first story if any
  if (tickets.length > 0) {
    const firstStoryId = tickets[0].id;
    if (firstStoryId) {
      selectStoryById(firstStoryId, false);
    } else {
      // Fallback to index selection
      currentStoryIndex = 0;
      selectStory(0, false);
    }
  }
  
  // Check for stories message
  updateStoriesVisibility();
}

/**
 * Update visibility of stories and related UI elements
 */
function updateStoriesVisibility() {
  // Existing function - unchanged
}

/**
 * Setup reveal and reset buttons
 */
function setupRevealResetButtons() {
  // Existing function - unchanged
}

/**
 * Setup CSV file uploader
 */
function setupCSVUploader() {
  // Existing function - unchanged
}

/**
 * Parse CSV text into array structure
 */
function parseCSV(data) {
  // Existing function - unchanged
}

/**
 * Display CSV data in the story list
 */
function displayCSVData(data) {
  // Prevent reentrant calls that could cause flickering or data loss
  if (processingCSVData) {
    console.log('[CSV] Already processing CSV data, ignoring reentrant call');
    return;
  }
  
  processingCSVData = true;
  
  try {
    const storyListContainer = document.getElementById('storyList');
    if (!storyListContainer) {
      return;
    }

    console.log(`[CSV] Displaying ${data.length} rows of CSV data`);

    // First, identify and save all manually added stories
    const existingStories = [];
    const manualStories = storyListContainer.querySelectorAll('.story-card[id^="story_"]:not([id^="story_csv_"])');
    
    manualStories.forEach(card => {
      const title = card.querySelector('.story-title');
      if (title) {
        existingStories.push({
          id: card.id,
          text: title.textContent
        });
      }
    });
    
    console.log(`[CSV] Saved ${existingStories.length} existing manual stories`);
    
    // Clear ONLY the CSV-based stories, not manual ones
    const csvStories = storyListContainer.querySelectorAll('.story-card[id^="story_csv_"]');
    csvStories.forEach(card => card.remove());
    
    // Re-add all stories to ensure they have proper indices
    storyListContainer.innerHTML = '';
    
    // First add back manually added stories
    existingStories.forEach((story, index) => {
      const storyItem = document.createElement('div');
      storyItem.classList.add('story-card');
      storyItem.id = story.id;
      storyItem.dataset.index = index;
      
      const storyTitle = document.createElement('div');
      storyTitle.classList.add('story-title');
      storyTitle.textContent = story.text;
      
      storyItem.appendChild(storyTitle);
      storyListContainer.appendChild(storyItem);
      
      // Use ID-based selection for click handler
      storyItem.addEventListener('click', () => {
        selectStoryById(story.id);
      });
    });
    
    // Then add CSV data
    let startIndex = existingStories.length;
    data.forEach((row, index) => {
      const storyId = `story_csv_${index}`;
      const storyItem = document.createElement('div');
      storyItem.classList.add('story-card');
      storyItem.id = storyId;
      storyItem.dataset.index = startIndex + index;
      
      const storyTitle = document.createElement('div');
      storyTitle.classList.add('story-title');
      storyTitle.textContent = row.join(' | ');
      
      storyItem.appendChild(storyTitle);
      storyListContainer.appendChild(storyItem);
      
      // Use ID-based selection for click handler
      storyItem.addEventListener('click', () => {
        selectStoryById(storyId);
      });
    });
    
    // Update preserved tickets list
    preservedManualTickets = existingStories;
    
    console.log(`[CSV] Display complete: ${existingStories.length} manual + ${data.length} CSV = ${storyListContainer.children.length} total`);
    
    // Check if there are any stories and show/hide message accordingly
    updateStoriesVisibility();
    
    // Select first story if none is selected
    const selectedStory = storyListContainer.querySelector('.story-card.selected');
    if (!selectedStory && storyListContainer.children.length > 0) {
      const firstStory = storyListContainer.children[0];
      selectStoryById(firstStory.id, false);
    }
  } finally {
    // Always release the processing flag
    processingCSVData = false;
  }
}

/**
 * Select a story by its ID
 * @param {string} storyId - ID of the story to select
 * @param {boolean} emitToServer - Whether to emit to server (default: true)
 */
function selectStoryById(storyId, emitToServer = true) {
  if (!storyId) {
    console.warn('[UI] Cannot select story: missing ID');
    return;
  }
  
  if (processingRemoteSelection) {
    console.log('[UI] Ignoring story selection during remote selection processing');
    return;
  }
  
  console.log('[UI] Selecting story by ID:', storyId, emitToServer ? '(will broadcast)' : '(local only)');
  
  // Find the story card with this ID
  const storyCard = document.getElementById(storyId);
  if (!storyCard) {
    console.warn(`[UI] Could not find story with ID: ${storyId}`);
    return;
  }
  
  // Get the index from the card's data attribute
  const index = parseInt(storyCard.dataset.index, 10);
  if (isNaN(index)) {
    console.warn(`[UI] Invalid index for story ID ${storyId}`);
    return;
  }
  
  // Select the story without emitting (we'll emit the ID-based selection instead)
  selectStoryInternal(index, storyId);
  
  // Emit to server if requested
  if (emitToServer && socket) {
    console.log('[EMIT] Broadcasting story selection by ID:', storyId);
    
    if (typeof emitStorySelectedById === 'function') {
      emitStorySelectedById(storyId);
    } else {
      socket.emit('storySelectedById', { storyId });
    }
    
    // Request votes for this story by index
    if (typeof requestStoryVotes === 'function') {
      requestStoryVotes(index);
    } else if (socket.emit) {
      socket.emit('requestStoryVotes', { storyIndex: index });
    }
  }
}

/**
 * Internal function to select a story by index and ID
 * @param {number} index - Index of the story
 * @param {string} storyId - ID of the story
 */
function selectStoryInternal(index, storyId) {
  // Update UI first for responsiveness
  document.querySelectorAll('.story-card').forEach(card => {
    card.classList.remove('selected', 'active');
  });
  
  const storyCard = document.getElementById(storyId) || document.querySelector(`.story-card[data-index="${index}"]`);
  
  if (storyCard) {
    storyCard.classList.add('selected', 'active');
    // Make sure it's visible
    storyCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    console.warn(`[UI] Could not find story card with index ${index} or ID ${storyId}`);
  }
  
  // Update local state
  currentStoryIndex = index;
  currentStoryId = storyId;
  
  // Render the story details
  renderCurrentStory();
  
  // Reset or restore vote badges for the current story
  resetOrRestoreVotes(index);
}

/**
 * Select a story by index (original function preserved for compatibility)
 * @param {number} index - Story index to select
 * @param {boolean} emitToServer - Whether to emit to server (default: true)
 */
function selectStory(index, emitToServer = true) {
  if (processingRemoteSelection) {
    console.log('[UI] Ignoring story selection during remote selection processing');
    return;
  }
  
  console.log('[UI] Story selection by index requested:', index, 
              emitToServer ? '(will broadcast)' : '(local only)');
  
  // Find the story card with this index
  const storyCard = document.querySelector(`.story-card[data-index="${index}"]`);
  if (!storyCard) {
    console.warn(`[UI] Could not find story with index: ${index}`);
    return;
  }
  
  // Get the ID from the card
  const storyId = storyCard.id;
  
  // Select the story (this will handle UI updates)
  selectStoryInternal(index, storyId);
  
  // Emit to server if requested
  if (emitToServer && socket) {
    if (storyId) {
      // Prefer ID-based selection
      console.log('[EMIT] Broadcasting story selection by ID:', storyId);
      if (typeof emitStorySelectedById === 'function') {
        emitStorySelectedById(storyId);
      } else {
        socket.emit('storySelectedById', { storyId });
      }
    } else {
      // Fall back to index-based selection
      console.log('[EMIT] Broadcasting story selection by index:', index);
      if (typeof emitStorySelected === 'function') {
        emitStorySelected(index);
      } else {
        socket.emit('storySelected', { storyIndex: index });
      }
    }
    
    // Request votes for this story
    if (typeof requestStoryVotes === 'function') {
      requestStoryVotes(index);
    } else if (socket.emit) {
      socket.emit('requestStoryVotes', { storyIndex: index });
    }
  }
}

/**
 * Reset or restore votes for a story
 */
function resetOrRestoreVotes(index) {
  // Existing function - unchanged
}

/**
 * Apply votes to UI
 */
function applyVotesToUI(votes, hideValues) {
  // Existing function - unchanged
}

/**
 * Reset all vote visuals
 */
function resetAllVoteVisuals() {
  // Existing function - unchanged
}

/**
 * Render the current story
 */
function renderCurrentStory() {
  const storyListContainer = document.getElementById('storyList');
  if (!storyListContainer) {
    console.warn('[UI] Cannot render current story - storyList not found');
    return;
  }

  const allStoryItems = storyListContainer.querySelectorAll('.story-card');
  
  // Log debugging info
  if (DEBUG_MODE) {
    console.log(`[UI] Rendering current story: index=${currentStoryIndex}, id=${currentStoryId} (total stories: ${allStoryItems.length})`);
  }
  
  // Remove 'active' class from all stories
  allStoryItems.forEach(card => card.classList.remove('active'));

  // First try to find by ID (more reliable)
  let current = currentStoryId ? document.getElementById(currentStoryId) : null;
  
  // If not found by ID, fall back to index
  if (!current) {
    current = allStoryItems[currentStoryIndex];
    if (current && !currentStoryId) {
      // Update the current ID from the found element
      currentStoryId = current.id;
    }
  }
  
  if (current) {
    if (DEBUG_MODE) {
      console.log('[UI] Activating story with text:', current.textContent.trim());
    }
    current.classList.add('active');
    
    // Also make sure it's scrolled into view
    current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    console.warn(`[UI] Could not find story at index ${currentStoryIndex} or with ID ${currentStoryId}`);
  }
  
  // Update the current story display, if present
  const currentStoryDisplay = document.getElementById('currentStory');
  if (currentStoryDisplay && current) {
    const storyTitle = current.querySelector('.story-title');
    if (storyTitle) {
      currentStoryDisplay.textContent = storyTitle.textContent;
    }
  }
}

/**
 * Helper function to get initials from name
 */
function getInitials(name) {
  // Existing function - unchanged
}

/**
 * Helper function to generate color from string
 */
function stringToColor(str) {
  // Existing function - unchanged
}

/**
 * Update the user list display with the new layout
 */
function updateUserList(users) {
  // Existing function - unchanged
}

/**
 * Create avatar container for a user
 */
function createAvatarContainer(user) {
  // Existing function - unchanged
}

/**
 * Create vote card space for a user
 */
function createVoteCardSpace(user) {
  // Existing function - unchanged
}

/**
 * Update vote visuals for a user
 */
function updateVoteVisuals(userId, vote, hasVoted = false) {
  // Existing function - unchanged
}

/**
 * Setup story navigation
 */
function setupStoryNavigation() {
  const nextButton = document.getElementById('nextStory');
  const prevButton = document.getElementById('prevStory');

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const storyList = document.getElementById('storyList');
      if (!storyList || storyList.children.length === 0) return;
      
      const currentIndex = currentStoryIndex;
      const newIndex = (currentIndex + 1) % storyList.children.length;
      
      console.log('[NAV] Next Story Clicked: from', currentIndex, 'to', newIndex);
      
      // Get the story element and its ID
      const nextStory = storyList.children[newIndex];
      if (nextStory && nextStory.id) {
        selectStoryById(nextStory.id);
      } else {
        // Fall back to index-based selection
        selectStory(newIndex);
      }
    });
  }

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      const storyList = document.getElementById('storyList');
      if (!storyList || storyList.children.length === 0) return;
      
      const currentIndex = currentStoryIndex;
      const newIndex = (currentIndex - 1 + storyList.children.length) % storyList.children.length;
      
      console.log('[NAV] Previous Story Clicked: from', currentIndex, 'to', newIndex);
      
      // Get the story element and its ID
      const prevStory = storyList.children[newIndex];
      if (prevStory && prevStory.id) {
        selectStoryById(prevStory.id);
      } else {
        // Fall back to index-based selection
        selectStory(newIndex);
      }
    });
  }
}

/**
 * Setup invite button
 */
function setupInviteButton() {
  // Existing function - unchanged
}

/**
 * Setup vote cards drag functionality
 */
function setupVoteCardsDrag() {
  // Existing function - unchanged
}

/**
 * Handle socket messages
 */
function handleSocketMessage(message) {
  const eventType = message.type;
  
  switch(eventType) {
    case 'userList':
      // Update the user list when server sends an updated list
      if (Array.isArray(message.users)) {
        updateUserList(message.users);
      }
      break;

    case 'addTicket':
      // Handle ticket added by another user
      if (message.ticketData) {
        console.log('[SOCKET] New ticket received:', message.ticketData);
        // Add ticket to UI without selecting it (to avoid loops)
        addTicketToUI(message.ticketData, false);
      }
      break;

    case 'allTickets':
      // Handle receiving all tickets (used when joining a room)
      if (Array.isArray(message.tickets)) {
        console.log('[SOCKET] Received all tickets:', message.tickets.length);
        processAllTickets(message.tickets);
      }
      break;
      
    case 'storySelectedById':
      // Handle story selection by ID from other users
      if (message.storyId) {
        console.log('[SOCKET] Remote story selection by ID received:', message.storyId);
        
        // Set flag to prevent loopback
        processingRemoteSelection = true;
        
        try {
          // Select the story locally without emitting back to server
          selectStoryById(message.storyId, false);
        } finally {
          // Always clear the flag
          processingRemoteSelection = false;
        }
      }
      break;
      
    case 'storySelected':
      // Handle story selection from other users
      if (message.storyIndex !== undefined) {
        console.log('[SOCKET] Remote story selection by index received:', message.storyIndex);
        
        // Set flag to prevent loopback
        processingRemoteSelection = true;
        
        try {
          // If we have a story ID, prefer using that
          if (message.storyId) {
            selectStoryById(message.storyId, false);
          } else {
            // Fall back to index-based selection
            selectStory(message.storyIndex, false);
          }
        } finally {
          // Always clear the flag
          processingRemoteSelection = false;
        }
      }
      break;
      
    case 'userJoined':
      // Individual user joined - could update existing list
      break;
      
    case 'userLeft':
      // Handle user leaving
      break;
      
    case 'voteReceived':
    case 'voteUpdate':
      // Handle vote received
      if (message.userId && message.vote) {
        if (!votesPerStory[currentStoryIndex]) {
          votesPerStory[currentStoryIndex] = {};
        }
        votesPerStory[currentStoryIndex][message.userId] = message.vote;
        updateVoteVisuals(message.userId, votesRevealed[currentStoryIndex] ? message.vote : '✓', true);
      }
      break;
      
    case 'votesRevealed':
      // Handle votes revealed
      votesRevealed[currentStoryIndex] = true;
      if (votesPerStory[currentStoryIndex]) {
        applyVotesToUI(votesPerStory[currentStoryIndex], false);
      }
      break;
      
    case 'votesReset':
      // Handle votes reset
      if (votesPerStory[currentStoryIndex]) {
        votesPerStory[currentStoryIndex] = {};
      }
      votesRevealed[currentStoryIndex] = false;
      resetAllVoteVisuals();
      break;
      
    case 'storyVotes':
      // Handle received votes for a specific story
      if (message.storyIndex !== undefined && message.votes) {
        votesPerStory[message.storyIndex] = message.votes;
        // Update UI if this is the current story and votes are revealed
        if (message.storyIndex === currentStoryIndex && votesRevealed[currentStoryIndex]) {
          applyVotesToUI(message.votes, false);
        }
      }
      break;
      
    case 'syncCSVData':
      // Handle CSV data sync with improved handling
      if (Array.isArray(message.csvData)) {
        console.log('[SOCKET] Received CSV data, length:', message.csvData.length);
        
        // Store the CSV data
        csvData = message.csvData;
        csvDataLoaded = true;
        
        // Temporarily save manually added tickets to preserve them
        const storyList = document.getElementById('storyList');
        const manualTickets = [];
        
        if (storyList) {
          const manualStoryCards = storyList.querySelectorAll('.story-card[id^="story_"]:not([id^="story_csv_"])');
          manualStoryCards.forEach(card => {
            const title = card.querySelector('.story-title');
            if (title) {
              manualTickets.push({
                id: card.id,
                text: title.textContent
              });
            }
          });
        }
        
        console.log(`[SOCKET] Preserved ${manualTickets.length} manually added tickets before CSV processing`);
        
        // Display CSV data (this will clear CSV stories but preserve manual ones)
        displayCSVData(csvData);
        
        // Update UI
        renderCurrentStory();
      }
      break;

    case 'connect':
      // When connection is established, request tickets
      setTimeout(() => {
        if (socket && socket.connected && !hasRequestedTickets) {
          console.log('[SOCKET] Connected, requesting all tickets');
          socket.emit('requestAllTickets');
          
          // Explicitly request the current user list
          socket.emit('requestUserList');
          
          // Request current story selection
          socket.emit('requestCurrentStory');
          
          hasRequestedTickets = true;
        }
      }, 500);
      break;
  }
}

// Add diagnostic function to check user list status
function checkUserListStatus() {
  // Existing function - unchanged
}

// Debug function that can be called from the console
window.debugStorySelection = function(enable = true) {
  DEBUG_MODE = enable;
  
  console.log('========= STORY SELECTION DEBUG =========');
  console.log('Current story index:', currentStoryIndex);
  console.log('Current story ID:', currentStoryId);
  
  const storyList = document.getElementById('storyList');
  if (!storyList) {
    console.error('No story list found!');
    return;
  }
  
  const storyCards = storyList.querySelectorAll('.story-card');
  console.log(`Total stories: ${storyCards.length}`);
  
  storyCards.forEach((card, i) => {
    const isSelected = card.classList.contains('selected');
    const isActive = card.classList.contains('active');
    const id = card.id;
    const index = card.dataset.index;
    const text = card.textContent.trim().substring(0, 30) + (card.textContent.length > 30 ? '...' : '');
    
    console.log(
      `Story ${i}: ${isSelected ? '[SELECTED]' : ''}${isActive ? '[ACTIVE]' : ''} ` +
      `ID: ${id}, Index: ${index}, Text: "${text}"`
    );
  });
  
  console.log('Connection status:', socket && socket.connected ? 'Connected' : 'Disconnected');
  console.log('Room ID:', roomId);
  console.log('Username:', userName);
  console.log('Processing remote selection:', processingRemoteSelection);
  console.log('==========================================');
  
  // Return info that might be useful
  return {
    currentIndex: currentStoryIndex,
    currentId: currentStoryId,
    storyCount: storyCards.length,
    isConnected: socket && socket.connected
  };
};

// Run diagnostic check after loading
setTimeout(checkUserListStatus, 3000);
