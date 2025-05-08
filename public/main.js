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
    
    // Check visibility
    ensureUserListVisible();
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
      
      // Ensure user list is visible
      ensureUserListVisible();
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
  
  // Schedule regular checks for user list visibility during the first minute
  setTimeout(ensureUserListVisible, 500);
  setTimeout(ensureUserListVisible, 2000);
  setTimeout(ensureUserListVisible, 5000);
  localStorage.setItem('lastVisibilityCheck', Date.now().toString());
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
 * Function to ensure user list is properly displayed
 */
function ensureUserListVisible() {
  console.log('[USERLIST] Checking user list visibility...');
  
  const userListContainer = document.getElementById('userList');
  if (!userListContainer) {
    console.error('[USERLIST] User list container not found!');
    return;
  }
  
  // Check if container is visible
  const containerStyle = window.getComputedStyle(userListContainer);
  const isVisible = containerStyle.display !== 'none' && containerStyle.visibility !== 'hidden';
  
  console.log('[USERLIST] User list container visibility:', isVisible ? 'Visible' : 'Hidden');
  
  const userEntries = userListContainer.querySelectorAll('.user-entry');
  console.log('[USERLIST] User entries found:', userEntries.length);
  
  if (userEntries.length === 0) {
    // Emergency: Add current user if no entries are visible
    addEmergencyUserEntry();
    
    // Request user list from server again
    if (socket && socket.connected) {
      console.log('[USERLIST] Requesting user list from server');
      socket.emit('requestUserList');
    }
  }
  
  // Don't check too frequently - only if at least 10 seconds have passed
  const lastCheck = localStorage.getItem('lastVisibilityCheck');
  const now = Date.now();
  if (!lastCheck || (now - parseInt(lastCheck, 10) > 10000)) {
    localStorage.setItem('lastVisibilityCheck', now.toString());
    
    // Check again in 5 seconds
    setTimeout(ensureUserListVisible, 5000);
  }
}

/**
 * Function to add emergency user entry
 */
function addEmergencyUserEntry() {
  const userListContainer = document.getElementById('userList');
  if (!userListContainer) return;
  
  const currentUsername = sessionStorage.getItem('userName');
  if (!currentUsername) return;
  
  console.log('[USERLIST] Adding emergency user entry for:', currentUsername);
  
  const userEntry = document.createElement('div');
  userEntry.classList.add('user-entry');
  userEntry.id = `user-emergency`;
  
  // Generate avatar color
  const avatarColor = stringToColor(currentUsername);
  
  userEntry.innerHTML = `
    <div class="avatar" style="background-color: ${avatarColor}">
      ${getInitials(currentUsername)}
    </div>
    <span class="username">${currentUsername}</span>
    <span class="vote-badge">?</span>
  `;
  
  userListContainer.appendChild(userEntry);
}

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
  const style = document.createElement('style');
  style.textContent = `
    .poker-table-layout {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      gap: 15px;
      padding: 20px 0;
    }
    
    .avatar-row {
      display: flex;
      justify-content: center;
      width: 100%;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .vote-row {
      display: flex;
      justify-content: center;
      width: 100%;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .avatar-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 80px;
      transition: transform 0.2s;
    }
    
    .avatar-container:hover {
      transform: translateY(-3px);
    }
    
    .avatar-circle {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #ccc;
      background-color: white;
      transition: all 0.3s ease;
    }
    
    .has-voted .avatar-circle {
      border-color: #4CAF50;
      background-color: #c1e1c1;
    }
    
    .user-name {
      font-size: 12px;
      margin-top: 5px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    
    .vote-card-space {
      width: 60px;
      height: 90px;
      border: 2px dashed #ccc;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f9f9f9;
      transition: all 0.2s ease;
    }
    
    .vote-card-space:hover {
      border-color: #999;
      background-color: #f0f0f0;
    }
    
    .vote-card-space.has-vote {
      border-style: solid;
      border-color: #673ab7;
      background-color: #f0e6ff;
    }
    
    .vote-badge {
      font-size: 22px;
      font-weight: bold;
      color: #673ab7;
    }
    
    .reveal-button-container {
      margin: 10px 0;
      width: 100%;
      display: flex;
      justify-content: center;
    }
    
    .reveal-votes-button {
      padding: 12px 24px;
      font-size: 16px;
      font-weight: bold;
      background-color: #ffffff;
      color: #673ab7;
      border: 2px solid #673ab7;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      letter-spacing: 1px;
    }
    
    .reveal-votes-button:hover {
      background-color: #673ab7;
      color: white;
    }
    
    .cards {
      margin-top: 30px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }
    
    .card {
      padding: 10px 20px;
      background: #cfc6f7;
      border-radius: 8px;
      cursor: grab;
      font-weight: bold;
      font-size: 18px;
      min-width: 40px;
      text-align: center;
      transition: transform 0.2s;
    }
    
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    /* Add hide-for-guests class if not already defined in index.html */
    .hide-for-guests {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Setup Add Ticket button
 */
function setupAddTicketButton() {
  const addTicketBtn = document.getElementById('addTicketBtn');
  if (!addTicketBtn) return;

  // Use the modal instead of prompt
  addTicketBtn.addEventListener('click', () => {
    if (typeof window.showAddTicketModal === 'function') {
      window.showAddTicketModal();
    } else {
      // Fallback to the old prompt method if modal function isn't available
      const storyText = prompt("Enter the story details:");
      if (storyText && storyText.trim()) {
        const ticketData = {
          id: `story_${Date.now()}`,
          text: storyText.trim()
        };
        
        if (typeof emitAddTicket === 'function') {
          emitAddTicket(ticketData);
        } else if (socket) {
          socket.emit('addTicket', ticketData);
        }
        
        addTicketToUI(ticketData, true);
        manuallyAddedTickets.push(ticketData);
      }
    }
  });
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
  const storyList = document.getElementById('storyList');
  const noStoriesMessage = document.getElementById('noStoriesMessage');
  
  const hasStories = storyList && storyList.children.length > 0;
  
  // Update no stories message
  if (noStoriesMessage) {
    noStoriesMessage.style.display = hasStories ? 'none' : 'block';
  }
  
  // Update planning cards state
  document.querySelectorAll('#planningCards .card').forEach(card => {
    if (hasStories) {
      card.classList.remove('disabled');
      card.setAttribute('draggable', 'true');
    } else {
      card.classList.add('disabled');
      card.setAttribute('draggable', 'false');
    }
  });
}

/**
 * Setup reveal and reset buttons
 */
function setupRevealResetButtons() {
  // Set up reveal votes button
  const revealVotesBtn = document.getElementById('revealVotesBtn');
  if (revealVotesBtn) {
    revealVotesBtn.addEventListener('click', () => {
      if (socket) {
        socket.emit('revealVotes');
        votesRevealed[currentStoryIndex] = true;
        
        // Update UI if we have votes for this story
        if (votesPerStory[currentStoryIndex]) {
          applyVotesToUI(votesPerStory[currentStoryIndex], false);
        }
      }
    });
  }
  
  // Set up reset votes button
  const resetVotesBtn = document.getElementById('resetVotesBtn');
  if (resetVotesBtn) {
    resetVotesBtn.addEventListener('click', () => {
      if (socket) {
        socket.emit('resetVotes');
        
        // Reset local state
        if (votesPerStory[currentStoryIndex]) {
          votesPerStory[currentStoryIndex] = {};
        }
        votesRevealed[currentStoryIndex] = false;
        
        // Update UI
        resetAllVoteVisuals();
      }
    });
  }
}

/**
 * Setup CSV file uploader
 */
function setupCSVUploader() {
  const csvInput = document.getElementById('csvInput');
  if (!csvInput) return;

  csvInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      // Save existing manually added tickets before processing CSV
      const storyList = document.getElementById('storyList');
      const existingTickets = [];
      
      if (storyList) {
        const manualTickets = storyList.querySelectorAll('.story-card[id^="story_"]:not([id^="story_csv_"])');
        manualTickets.forEach(card => {
          const title = card.querySelector('.story-title');
          if (title) {
            existingTickets.push({
              id: card.id, 
              text: title.textContent
            });
          }
        });
      }
      
      console.log(`[CSV] Saved ${existingTickets.length} manual tickets before processing upload`);
      
      // Parse the CSV data
      const parsedData = parseCSV(e.target.result);
      
      // Store in the module state
      csvData = parsedData;
      
      // Display CSV data - this will clear and rebuild the story list
      displayCSVData(csvData);
      
      // Re-add the preserved manual tickets
      existingTickets.forEach((ticket, index) => {
        // Make sure this ticket isn't already in the list to avoid duplicates
        if (!document.getElementById(ticket.id)) {
          addTicketToUI(ticket, false);
        }
      });
      
      // Store these for future preservation
      preservedManualTickets = [...existingTickets];
      
      // Emit the CSV data to server AFTER ensuring all UI is updated
      emitCSVData(parsedData);
      
      // Reset voting state for new data
      votesPerStory = {};
      votesRevealed = {};
      
      // Reset current story index only if no stories were selected before
      if (!document.querySelector('.story-card.selected')) {
        currentStoryIndex = 0;
        renderCurrentStory();
      }
    };
    reader.readAsText(file);
  });
}

/**
 * Parse CSV text into array structure
 */
function parseCSV(data) {
  const rows = data.trim().split('\n');
  return rows.map(row => row.split(','));
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
  resetAllVoteVisuals();
  
  // If we have stored votes for this story and they've been revealed
  if (votesPerStory[index] && votesRevealed[index]) {
    applyVotesToUI(votesPerStory[index], false);
  }
}

/**
 * Apply votes to UI
 */
function applyVotesToUI(votes, hideValues) {
  Object.entries(votes).forEach(([userId, vote]) => {
    updateVoteVisuals(userId, hideValues ? '✓' : vote, true);
  });
}

/**
 * Reset all vote visuals
 */
function resetAllVoteVisuals() {
  document.querySelectorAll('.vote-badge').forEach(badge => {
    badge.textContent = '?';
  });
  
  document.querySelectorAll('.has-vote').forEach(el => {
    el.classList.remove('has-vote');
  });
  
  document.querySelectorAll('.has-voted').forEach(el => {
    el.classList.remove('has-voted');
  });
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
  if (!name) return '?';
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Helper function to generate color from string
 */
function stringToColor(str) {
  if (!str) return '#673ab7'; // Default purple
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  
  return color;
}

/**
 * Update the user list display with the new layout
 */
function updateUserList(users) {
  // Check if users is valid
  if (!Array.isArray(users) || users.length === 0) {
    console.warn('[UI] Empty or invalid user list received:', users);
    return;
  }
  
  console.log('[UI] Updating user list with', users.length, 'users:', 
    users.map(u => `${u.name || 'unnamed'} (${u.id})`).join(', '));
  
  const userListContainer = document.getElementById('userList');
  const userCircleContainer = document.getElementById('userCircle');
  
  if (!userListContainer) {
    console.error('[UI] User list container not found!');
    return;
  }
  
  if (!userCircleContainer) {
    console.warn('[UI] User circle container not found, but continuing with sidebar user list');
  }
  
  // Clear existing content in the sidebar user list
  userListContainer.innerHTML = '';
  
  // Clear user circle if it exists
  if (userCircleContainer) {
    userCircleContainer.innerHTML = '';
  }

  // Create left sidebar user list
  users.forEach(user => {
    // Skip users with empty names
    if (!user || !user.name) {
      console.warn('[UI] Skipping user with empty name:', user);
      return;
    }
    
    const userEntry = document.createElement('div');
    userEntry.classList.add('user-entry');
    userEntry.id = `user-${user.id}`;
    
    // Generate avatar background color based on name
    const avatarColor = stringToColor(user.name);
    
    userEntry.innerHTML = `
      <div class="avatar" style="background-color: ${avatarColor}">
        ${getInitials(user.name)}
      </div>
      <span class="username">${user.name}</span>
      <span class="vote-badge">?</span>
    `;
    
    userListContainer.appendChild(userEntry);
  });

  // If userCircleContainer exists, create the poker layout
  if (userCircleContainer) {
    createPokerTableLayout(userCircleContainer, users);
  }
  
  // After updating users, check if we need to request tickets
  if (!hasRequestedTickets && users.length > 0) {
    setTimeout(() => {
      if (socket && socket.connected) {
        console.log('[INFO] Requesting all tickets after user list update');
        socket.emit('requestAllTickets');
        hasRequestedTickets = true;
      }
    }, 500);
  }
  
  console.log('[UI] User list updated successfully with', users.length, 'users');
}

/**
 * Create the poker table layout
 */
function createPokerTableLayout(container, users) {
  // Create new grid layout for center area
  const gridLayout = document.createElement('div');
  gridLayout.classList.add('poker-table-layout');

  // Split users into two rows
  const halfPoint = Math.ceil(users.length / 2);
  const topUsers = users.slice(0, halfPoint);
  const bottomUsers = users.slice(halfPoint);

  // Create top row of avatars
  const topAvatarRow = document.createElement('div');
  topAvatarRow.classList.add('avatar-row');
  
  topUsers.forEach(user => {
    const avatarContainer = createAvatarContainer(user);
    topAvatarRow.appendChild(avatarContainer);
  });
  
  // Create top row of vote cards
  const topVoteRow = document.createElement('div');
  topVoteRow.classList.add('vote-row');
  
  topUsers.forEach(user => {
    const voteCard = createVoteCardSpace(user);
    topVoteRow.appendChild(voteCard);
  });

  // Create reveal button
  const revealButtonContainer = document.createElement('div');
  revealButtonContainer.classList.add('reveal-button-container');
  
  const revealBtn = document.createElement('button');
  revealBtn.textContent = 'REVEAL VOTES';
  revealBtn.classList.add('reveal-votes-button');
  
  // Handle guest mode for the reveal button
  if (isGuestUser()) {
    revealBtn.classList.add('hide-for-guests');
  } else {
    revealBtn.onclick = () => {
      if (socket) {
        socket.emit('revealVotes');
        votesRevealed[currentStoryIndex] = true;
        
        // Update UI if we have votes for this story
        if (votesPerStory[currentStoryIndex]) {
          applyVotesToUI(votesPerStory[currentStoryIndex], false);
        }
      }
    };
  }
  
  revealButtonContainer.appendChild(revealBtn);

  // Create bottom row of vote cards
  const bottomVoteRow = document.createElement('div');
  bottomVoteRow.classList.add('vote-row');
  
  bottomUsers.forEach(user => {
    const voteCard = createVoteCardSpace(user);
    bottomVoteRow.appendChild(voteCard);
  });

  // Create bottom row of avatars
  const bottomAvatarRow = document.createElement('div');
  bottomAvatarRow.classList.add('avatar-row');
  
  bottomUsers.forEach(user => {
    const avatarContainer = createAvatarContainer(user);
    bottomAvatarRow.appendChild(avatarContainer);
  });

  // Assemble the grid
  gridLayout.appendChild(topAvatarRow);
  gridLayout.appendChild(topVoteRow);
  gridLayout.appendChild(revealButtonContainer);
  gridLayout.appendChild(bottomVoteRow);
  gridLayout.appendChild(bottomAvatarRow);
  
  container.appendChild(gridLayout);
}

/**
 * Create avatar container for a user
 */
function createAvatarContainer(user) {
  const avatarContainer = document.createElement('div');
  avatarContainer.classList.add('avatar-container');
  avatarContainer.id = `user-circle-${user.id}`;
  
  // Generate avatar background color
  const avatarColor = stringToColor(user.name);
  
  avatarContainer.innerHTML = `
    <div class="avatar-circle" style="background-color: ${avatarColor}">
      ${getInitials(user.name)}
    </div>
    <div class="user-name">${user.name}</div>
  `;
  
  avatarContainer.setAttribute('data-user-id', user.id);
  
  // Check if there's an existing vote for this user in the current story
  const existingVote = votesPerStory[currentStoryIndex]?.[user.id];
  if (existingVote) {
    avatarContainer.classList.add('has-voted');
  }
  
  return avatarContainer;
}

/**
 * Create vote card space for a user
 */
function createVoteCardSpace(user) {
  const voteCard = document.createElement('div');
  voteCard.classList.add('vote-card-space');
  voteCard.id = `vote-space-${user.id}`;
  
  // Add vote badge inside the card space
  const voteBadge = document.createElement('span');
  voteBadge.classList.add('vote-badge');
  voteBadge.textContent = '?';
  voteCard.appendChild(voteBadge);
  
  // Make it a drop target for vote cards
  voteCard.addEventListener('dragover', (e) => e.preventDefault());
  voteCard.addEventListener('drop', (e) => {
    e.preventDefault();
    const vote = e.dataTransfer.getData('text/plain');
    const userId = user.id;

    if (socket && vote) {
      socket.emit('castVote', { vote, targetUserId: userId });
    }

    // Store vote locally
    if (!votesPerStory[currentStoryIndex]) {
      votesPerStory[currentStoryIndex] = {};
    }
    votesPerStory[currentStoryIndex][userId] = vote;
    
    // Update UI - show checkmark if votes aren't revealed
    updateVoteVisuals(userId, votesRevealed[currentStoryIndex] ? vote : '✓', true);
  });
  
  // Check if there's an existing vote for this user in the current story
  const existingVote = votesPerStory[currentStoryIndex]?.[user.id];
  if (existingVote) {
    voteCard.classList.add('has-vote');
    voteBadge.textContent = votesRevealed[currentStoryIndex] ? existingVote : '✓';
  }
  
  return voteCard;
}

/**
 * Update vote visuals for a user
 */
function updateVoteVisuals(userId, vote, hasVoted = false) {
  // Update badges in sidebar
  const sidebarBadge = document.querySelector(`#user-${userId} .vote-badge`);
  if (sidebarBadge) sidebarBadge.textContent = vote;
  
  // Update vote card space
  const voteSpace = document.querySelector(`#vote-space-${userId}`);
  if (voteSpace) {
    const voteBadge = voteSpace.querySelector('.vote-badge');
    if (voteBadge) voteBadge.textContent = vote;
    
    if (hasVoted) {
      voteSpace.classList.add('has-vote');
    } else {
      voteSpace.classList.remove('has-vote');
    }
  }

  // Update avatar to show they've voted
  if (hasVoted) {
    const avatarContainer = document.querySelector(`#user-circle-${userId}`);
    if (avatarContainer) {
      avatarContainer.classList.add('has-voted');
      
      const avatar = avatarContainer.querySelector('.avatar-circle');
      if (avatar) {
        avatar.style.backgroundColor = '#c1e1c1'; // Green background
      }
    }
    
    // Also update sidebar avatar
    const sidebarAvatar = document.querySelector(`#user-${userId} .avatar`);
    if (sidebarAvatar) {
      sidebarAvatar.style.backgroundColor = '#c1e1c1';
    }
  }
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
  const inviteButton = document.getElementById('inviteButton');
  if (!inviteButton) return;

  inviteButton.onclick = () => {
    // Check if the custom function exists in window scope
    if (typeof window.showInviteModalCustom === 'function') {
      window.showInviteModalCustom();
    } else if (typeof showInviteModalCustom === 'function') {
      showInviteModalCustom();
    } else {
      // Fallback if function isn't available
      const currentUrl = new URL(window.location.href);
      const params = new URLSearchParams(currentUrl.search);
      const roomId = params.get('roomId') || getRoomIdFromURL();
      
      // Create guest URL (remove any host parameter)
      const guestUrl = `${currentUrl.origin}${currentUrl.pathname}?roomId=${roomId}`;
      
      alert(`Share this invite link: ${guestUrl}`);
    }
  };
}

/**
 * Setup vote cards drag functionality
 */
function setupVoteCardsDrag() {
  document.querySelectorAll('#planningCards .card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.textContent.trim());
    });
  });
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

// Improved check user list status function
function checkUserListStatus() {
  console.log('[DIAGNOSTIC] Checking user list status...');
  
  const userListEl = document.getElementById('userList');
  if (!userListEl) {
    console.log('[DIAGNOSTIC] User list element not found!');
    return;
  }
  
  const userEntries = userListEl.querySelectorAll('.user-entry');
  console.log('[DIAGNOSTIC] Found', userEntries.length, 'user entries in DOM');
  
  if (userEntries.length === 0) {
    console.log('[DIAGNOSTIC] User list is empty! Adding emergency entry...');
    
    addEmergencyUserEntry();
    
    // Also try to request user list again from server
    if (socket && socket.connected) {
      console.log('[DIAGNOSTIC] Requesting user list from server');
      socket.emit('requestUserList');
    }
  }
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

// Add window functions for manual debugging and fixing
window.fixUserList = ensureUserListVisible;
window.debugUsers = function() {
  console.log('User list container:', document.getElementById('userList'));
  console.log('User entries:', document.querySelectorAll('.user-entry').length);
  return document.querySelectorAll('#userList .user-entry');
};

// Run diagnostic check after loading
setTimeout(checkUserListStatus, 3000);
