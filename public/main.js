// Get username from sessionStorage (already set from main.html or by index.html prompt)
let userName = sessionStorage.getItem('userName');
let processingCSVData = false;
// Import socket functionality
import { initializeWebSocket, emitCSVData, requestStoryVotes, emitAddTicket, getUserVotes } from './socket.js'; 

// Track deleted stories client-side
let deletedStoryIds = new Set();

// Flag to track manually added tickets that need to be preserved
let preservedManualTickets = [];
// Flag to prevent duplicate delete confirmation dialogs
let deleteConfirmationInProgress = false;
let hasReceivedStorySelection = false;
window.currentVotesPerStory = {}; // Ensure global reference for UI
let heartbeatInterval; // Store interval reference for cleanup

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
 * @param {Object} ticketData - Ticket data {id, text} - [Will now properly set name/description]
 */
window.addTicketFromModal = function(ticketData) {
  if (!ticketData || !ticketData.id ) return; // text not required as will build
const ticketName = document.getElementById('ticketNameInput').value?.trim() || '';
// Get Quill editor content for description:
const ticketDescription = window.quill ? window.quill.root.innerText.trim() : '';
  

  const displayText = ticketName && ticketDescription ? `${ticketName} : ${ticketDescription}` : (ticketName || ticketDescription)

    //Make sure deleted card can't pass, we can not do anything here.
  if (deletedStoryIds.has(ticketData.id)) {
    console.log('[MODAL] Cannot add previously deleted ticket:', ticketData.id);
    return;
  }
  
  console.log('[MODAL] Adding ticket from modal:', ticketData);

  // Update ticketdata with name and values
    let validData =  false
    if (ticketName != null && ticketDescription != null){

      //Create JSON to store the data
          ticketData.text = displayText			 //String
          ticketData.idDisplay = ticketName	 //Store name
      	  ticketData.descriptionDisplay = ticketDescription 	 //Description
          validData = true
      } 

  //This flag may not be usefull in the current iteration of code.
  // Emit to server for synchronization, pass ticketData.text not the other values
       if ( (typeof emitAddTicket === 'function')&& validData  )  {  //Prevent code failing
                emitAddTicket(ticketData);
         }  else if (socket && validData ) {       //Old code fix

                 socket.emit('addTicket', ticketData)       //Make sure this gets past if all of previous ones are not correct
         }


  //Add ticket data after it passes.
  if(validData){
        addTicketToUI(ticketData, true);		          //Store ticket data locally.
  }
  //For now it doesn't need to do anything anyway.
  manuallyAddedTickets.push(ticketData);
  return;
};

/**
 * Initialize socket with a specific name (used when joining via invite)
 * @param {string} roomId - Room ID to join 
 * @param {string} name - Username to use
 */
window.initializeSocketWithName = function(roomId, name) {
  if (!roomId || !name) return;
  
  console.log(`[APP] Initializing socket with name: ${name} for room: ${roomId}`);
  
  // Set username in the module scope
  userName = name;
  
  // Load deleted stories from sessionStorage first
  loadDeletedStoriesFromStorage(roomId);
  
  // Initialize socket with the name
  socket = initializeWebSocket(roomId, name, handleSocketMessage);
  
  // Continue with other initialization steps
  setupCSVUploader();
  setupInviteButton();
  setupStoryNavigation();
  setupVoteCardsDrag();
  setupRevealResetButtons();
  setupAddTicketButton();
  setupGuestModeRestrictions();
  cleanupDeleteButtonHandlers();
  setupCSVDeleteButtons();
  
  // Add CSS for new layout
  addNewLayoutStyles();
  
  // Setup heartbeat to prevent idle timeouts
//  setupHeartbeat();
};

/**
 * Set up heartbeat mechanism to prevent connection timeouts
 
function setupHeartbeat() {
  // Clear any existing heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // Send heartbeat every 20 seconds to keep the connection alive
  heartbeatInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('heartbeat');
      console.log('[SOCKET] Heartbeat sent');
    } else if (reconnectingInProgress) {
      console.log('[SOCKET] Skipping heartbeat during reconnection');
    } else {
      console.warn('[SOCKET] Cannot send heartbeat - socket disconnected');
      // Try to reinitialize if disconnected unexpectedly
      if (!reconnectingInProgress) {
        console.log('[SOCKET] Attempting to reinitialize connection...');
        const roomId = getRoomIdFromURL();
        if (roomId) {
          socket = initializeWebSocket(roomId, userName, handleSocketMessage);
        }
      }
    }
  }, 20000); // 20 seconds interval

  // Clear interval on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeatInterval);
  });
}*/
/**
 * Handle updating a ticket from the modal
 * @param {Object} ticketData - Updated ticket data {id, text, isEdit: true}
 */
window.updateTicketFromModal = function(ticketData) {
  if (!ticketData || !ticketData.id) return;

  const ticketName = document.getElementById('ticketNameInput').value?.trim() || '';
  const ticketDescription = window.quill ? window.quill.root.innerText.trim() : '';

  const displayText = ticketName && ticketDescription
    ? `${ticketName} : ${ticketDescription}`
    : (ticketName || ticketDescription);

  ticketData.text = displayText;
  ticketData.idDisplay = ticketName;
  ticketData.descriptionDisplay = ticketDescription;

  console.log('[UPDATE] Updating ticket from modal:', ticketData);

  // Update in UI
  updateTicketInUI(ticketData);

  // Emit to server for synchronization
  if (socket) {
    socket.emit('updateTicket', ticketData);
  }
};
/**
 * Update ticket in the UI
 * @param {Object} ticketData - Updated ticket data
 */
function updateTicketInUI(ticketData) {
  if (!ticketData || !ticketData.id || !ticketData.text) {
    console.warn('[UI] Invalid or empty ticketData passed to updateTicketInUI:', ticketData);
    return;
  }

  const storyCard = document.getElementById(ticketData.id);
  if (!storyCard) return;

  const storyTitle = storyCard.querySelector('.story-title');
  if (storyTitle) {
    storyTitle.textContent = ticketData.text;
    console.log('[UI] Updated ticket in UI:', ticketData.id, ' with text:', ticketData.text);
  }
}




/**
 * Load deleted story IDs from sessionStorage
 */
function loadDeletedStoriesFromStorage(roomId) {
  try {
    const storedDeletedStories = sessionStorage.getItem(`deleted_${roomId}`);
    if (storedDeletedStories) {
      const parsedDeleted = JSON.parse(storedDeletedStories);
      if (Array.isArray(parsedDeleted)) {
        // Initialize our Set with the stored array
        deletedStoryIds = new Set(parsedDeleted);
        console.log(`[STORAGE] Loaded ${parsedDeleted.length} deleted story IDs from storage`);
      }
    }
  } catch (err) {
    console.warn('[STORAGE] Error loading deleted stories:', err);
  }
}

/**
 * Safely merge a vote for a story by replacing older votes with the same value.
 * This avoids duplicate votes when a user refreshes and gets a new socket ID.
 */
function mergeVote(storyId, userName, vote) {
  if (!votesPerStory[storyId]) votesPerStory[storyId] = {};
  if (votesPerStory[storyId][userName] === vote) return; // avoid unnecessary overwrite
  votesPerStory[storyId][userName] = vote;
  window.currentVotesPerStory = votesPerStory;
}

function clearAllVoteVisuals() {
  const badges = document.querySelectorAll('.vote-badge');
  badges.forEach(badge => {
    badge.textContent = '';
    badge.removeAttribute('title');
    badge.innerHTML = '';
  });

  const voteSpaces = document.querySelectorAll('.vote-card-space');
  voteSpaces.forEach(space => {
    space.classList.remove('has-vote');
  });
  
  // Also clear the "has-voted" class from user avatars
  const avatarContainers = document.querySelectorAll('.avatar-container');
  avatarContainers.forEach(container => {
    container.classList.remove('has-voted');
    const avatar = container.querySelector('.avatar-circle');
    if (avatar) {
      avatar.style.backgroundColor = ''; // Reset background color
    }
  });
}
function refreshVoteDisplay() {
  try {
    // Clear all vote visuals first
    clearAllVoteVisuals();

    const currentStoryId = getCurrentStoryId();
    if (!currentStoryId) return;

    const currentVotes = window.currentVotesPerStory?.[currentStoryId] || {};

    // Track processed usernames to avoid duplicates
    const processedUsernames = new Set();

    // Get all currently active users with their socket IDs
    const activeUsers = new Map();
    document.querySelectorAll('.avatar-container').forEach(container => {
      const userId = container.getAttribute('data-user-id');
      const userName = container.querySelector('.user-name')?.textContent;
      if (userId && userName) {
        activeUsers.set(userName, userId);
      }
    });

    // Build a mapping of username to latest vote
    const userVotes = {};
    for (const [socketId, vote] of Object.entries(currentVotes)) {
      const name = userMap?.[socketId] || socketId;
      userVotes[name] = { socketId, vote };
    }

    // Apply votes to UI
    for (const [username, data] of Object.entries(userVotes)) {
      if (processedUsernames.has(username)) continue;
      processedUsernames.add(username);

      const socketIdToUse = activeUsers.get(username) || data.socketId;
      updateVoteVisuals(socketIdToUse, data.vote, true);
    }

  } catch (error) {
    console.error('[VOTE] Error in refreshVoteDisplay:', error);
  }
}




function updateVoteBadges(storyId, votes) {
  // Count how many unique users have voted for this story
  const voteCount = Object.keys(votes).length;

  console.log(`Story ${storyId} has ${voteCount} votes`);

  // Find the vote badge element for the story (adjust selector as per your HTML)
  const voteBadge = document.querySelector(`#vote-badge-${storyId}`);

  if (voteBadge) {
    // Update the badge text to show number of votes
    voteBadge.textContent = voteCount;

    // Optionally update a tooltip or aria-label for accessibility
    voteBadge.setAttribute('title', `${voteCount} vote${voteCount !== 1 ? 's' : ''}`);
  }
}

/**
 * Save deleted story IDs to sessionStorage
 */
function saveDeletedStoriesToStorage(roomId) {
  try {
    const deletedArray = Array.from(deletedStoryIds);
    sessionStorage.setItem(`deleted_${roomId}`, JSON.stringify(deletedArray));
    console.log(`[STORAGE] Saved ${deletedArray.length} deleted story IDs to storage`);
  } catch (err) {
    console.warn('[STORAGE] Error saving deleted stories:', err);
  }
}

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
  //  window.history.replaceState({}, document.title, window.location.pathname);
  // Load deleted stories from sessionStorage first
  loadDeletedStoriesFromStorage(roomId);
  
  initializeApp(roomId);
});

// Global state variables
let pendingStoryIndex = null;
let csvData = [];
let currentStoryIndex = 0;
let userVotes = {};
let socket = null;
let csvDataLoaded = false;
let votesPerStory = {};     // Track votes for each story { storyIndex: { userId: vote, ... }, ... }
let votesRevealed = {};     // Track which stories have revealed votes { storyIndex: boolean }
let manuallyAddedTickets = []; // Track tickets added manually
let hasRequestedTickets = false; // Flag to track if we've already requested tickets
let reconnectingInProgress = false; // Flag for reconnection logic
let currentEditingTicketId = null;

// Adding this function to main.js to be called whenever votes are revealed
function fixRevealedVoteFontSizes() {
  console.log('[DEBUG] Fixing revealed vote font sizes');
  // Target all vote badges in revealed state
  const voteCards = document.querySelectorAll('.vote-card-space.has-vote .vote-badge');
  
  voteCards.forEach(badge => {
    // Get the text content
    const text = badge.textContent || '';
    
    // Set base size
    let fontSize = '18px';
    
    // Use smaller font for longer text
    if (text.length >= 2) {
      fontSize = '16px';
    }
    
    // Even smaller for special cases
    if (text.includes('XX')) {
      fontSize = '14px';
    }
    
    // Apply the styles directly
    badge.style.fontSize = fontSize;
    badge.style.fontWeight = '600';
    badge.style.maxWidth = '80%';
    badge.style.textAlign = 'center';
    badge.style.display = 'block';
    
    console.log(`[DEBUG] Applied font size ${fontSize} to vote badge with text "${text}"`);
  });
}

function addFixedVoteStatisticsStyles() {
  // Remove any existing vote statistics styles to avoid conflicts
  const existingStyle = document.getElementById('fixed-vote-statistics-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  const style = document.createElement('style');
  style.id = 'fixed-vote-statistics-styles'; // Use a different ID
  
  style.textContent = `
    .fixed-vote-display {
      background-color: white;
      border-radius: 8px;
      max-width: 300px;
      margin: 20px auto;
      padding: 20px;
      display: flex;
      align-items: flex-start;
    }
    
    .fixed-vote-card {
      border: 2px solid #000;
      border-radius: 8px;
      width: 60px;
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: bold;
      margin-right: 40px;
      position: relative;
    }
    
    .fixed-vote-count {
      position: absolute;
      bottom: -25px;
      left: 0;
      width: 100%;
      text-align: center;
      font-size: 14px;
      color: #666;
    }
    
    .fixed-vote-stats {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    
    .fixed-stat-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .fixed-stat-label {
      font-size: 16px;
      color: #666;
    }
    
    .fixed-stat-value {
      font-size: 26px;
      font-weight: bold;
    }
    
    .fixed-agreement-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #ffeb3b;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .fixed-agreement-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: white;
    }
  `;
  
  document.head.appendChild(style);
}

// Create a new function to generate the stats layout

function createFixedVoteDisplay(votes) {
  const container = document.createElement('div');
  container.className = 'fixed-vote-display';

  const userMap = window.userMap || {};
  const uniqueVotes = new Map();

  for (const [id, vote] of Object.entries(votes)) {
    const name = userMap[id] || id;
    if (!uniqueVotes.has(name)) {
      uniqueVotes.set(name, vote);
    }
  }

  const voteValues = Array.from(uniqueVotes.values());


  // Extract numeric values only
  const numericValues = voteValues
    .filter(v => !isNaN(parseFloat(v)) && v !== null && v !== undefined)
    .map(v => parseFloat(v));

  // Default values
  let mostCommonVote = voteValues.length > 0 ? voteValues[0] : '0';
  let voteCount = voteValues.length;
  let averageValue = 0;

  // Calculate statistics
  if (numericValues.length > 0) {
    const voteFrequency = {};
    let maxCount = 0;

    voteValues.forEach(vote => {
      voteFrequency[vote] = (voteFrequency[vote] || 0) + 1;
      if (voteFrequency[vote] > maxCount) {
        maxCount = voteFrequency[vote];
        mostCommonVote = vote;
      }
    });

    averageValue = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    averageValue = Math.round(averageValue * 10) / 10;
  }

  // Create HTML that shows the stats
  container.innerHTML = `
    <div class="fixed-vote-card">
      ${mostCommonVote}
      <div class="fixed-vote-count">${voteCount} Vote${voteCount !== 1 ? 's' : ''}</div>
    </div>
    <div class="fixed-vote-stats">
      <div class="fixed-stat-group">
        <div class="fixed-stat-label">Average:</div>
        <div class="fixed-stat-value">${averageValue}</div>
      </div>
      <div class="fixed-stat-group">
        <div class="fixed-stat-label">Agreement:</div>
        <div class="fixed-agreement-circle">
          <div class="agreement-icon">👍</div>
        </div>
      </div>
    </div>
  `;

  return container;
}

/**
 * Determines if current user is a guest
 */
function isGuestUser() {
  // Check sessionStorage first (most reliable)
  const isHostFromStorage = sessionStorage.getItem('isHost');
  if (isHostFromStorage !== null) {
    return isHostFromStorage === 'false';
  }
  
  // Fallback: If joining via shared URL without being marked as host
  const urlParams = new URLSearchParams(window.location.search);
  const hasRoomId = urlParams.has('roomId');
  const isRoomCreator = sessionStorage.getItem('isRoomCreator') === 'true';
  
  // If there's a roomId but user didn't create the room, they're a guest
  return hasRoomId && !isRoomCreator;
}

/**
 * Determines if current user is the host
 */
function isCurrentUserHost() {
  // Check sessionStorage first (most reliable)
  const isHostFromStorage = sessionStorage.getItem('isHost');
  if (isHostFromStorage !== null) {
    return isHostFromStorage === 'true';
  }
  
  // Fallback: Check if user created the room
  return sessionStorage.getItem('isRoomCreator') === 'true';
}

function setupPlanningCards() {
  const container = document.getElementById('planningCards');
  if (!container) return;

  const votingSystem = sessionStorage.getItem('votingSystem') || 'fibonacci';

  const scales = {
    fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21'],
    shortFib: ['0', '½', '1', '2', '3'],
    tshirt: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
    tshirtNum: ['XS (1)', 'S (2)', 'M (3)', 'L (5)', 'XL (8)', 'XXL (13)'],
    custom: ['?', '☕', '∞']
  };

  const values = scales[votingSystem] || scales.fibonacci;

  container.innerHTML = ''; // Clear any existing cards

  values.forEach(value => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-value', value);
    card.setAttribute('draggable', 'true');
    card.textContent = value;
    container.appendChild(card);
  });

  // ✅ Enable drag after cards are added
  setupVoteCardsDrag();
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
  // Fallback: generate a room if not present
  return roomId || 'room-' + Math.floor(Math.random() * 10000);
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
  socket.on('connect', () => {
  // Immediately map own socket ID to username
  if (!window.userMap) window.userMap = {};
  window.userMap[socket.id] = userName;
});

  if (socket && socket.io) {
    socket.io.reconnectionAttempts = 10;
    socket.io.timeout = 20000;
    socket.io.reconnectionDelay = 2000;
  }

  // Setup heartbeat mechanism to prevent timeouts
//  setupHeartbeat();

  socket.on('voteUpdate', ({ userId, userName, vote, storyId }) => {
    const name = userName || userId;
    mergeVote(storyId, name, vote);

    const currentId = getCurrentStoryId();
    if (storyId === currentId) {
      updateVoteVisuals(name, votesRevealed[storyId] ? vote : '👍', true);
    }

    refreshVoteDisplay();
  });
  
  socket.on('storyVotes', ({ storyId, votes }) => {
    // Don't process votes for deleted stories
    if (deletedStoryIds.has(storyId)) {
      console.log(`[VOTE] Ignoring votes for deleted story: ${storyId}`);
      return;
    }
    
    if (!votesPerStory[storyId]) {
      votesPerStory[storyId] = {};
    }
    
    // Store the votes
    votesPerStory[storyId] = { ...votes };
    window.currentVotesPerStory = votesPerStory;
    
    // Update UI immediately if this is the current story
    const currentStoryId = getCurrentStoryId();
    if (currentStoryId === storyId) {
      if (votesRevealed[storyId]) {
        // Show actual votes if revealed
        applyVotesToUI(votes, false);
      } else {
        // Show thumbs up if not revealed
        applyVotesToUI(votes, true);
      }
    }
  });
  
  // Updated handler for restored user votes
  socket.on('restoreUserVote', ({ storyId, vote }) => {
    const name = sessionStorage.getItem('userName') || socket.id;
    mergeVote(storyId, name, vote);
    refreshVoteDisplay();
  });
  
  // Updated resyncState handler to restore votes
  socket.on('resyncState', ({ tickets, votesPerStory: serverVotes, votesRevealed: serverRevealed, deletedStoryIds: serverDeletedIds }) => {
    console.log('[SOCKET] Received resyncState from server');

    // Update local deleted stories tracking
    if (Array.isArray(serverDeletedIds)) {
      serverDeletedIds.forEach(id => deletedStoryIds.add(id));
      saveDeletedStoriesToStorage(roomId);
    }

    // Filter and process non-deleted tickets
    const filteredTickets = (tickets || []).filter(ticket => !deletedStoryIds.has(ticket.id));
    if (Array.isArray(filteredTickets)) {
      processAllTickets(filteredTickets);
    }

    // Update local vote state for non-deleted stories
    if (serverVotes) {
      for (const [storyId, votes] of Object.entries(serverVotes)) {
        if (deletedStoryIds.has(storyId)) continue;

        if (!votesPerStory[storyId]) votesPerStory[storyId] = {};

        for (const [userId, vote] of Object.entries(votes)) {
          mergeVote(storyId, userId, vote);
        }

        const isRevealed = serverRevealed && serverRevealed[storyId];
        votesRevealed[storyId] = isRevealed;

        // UI update for current story
        const currentId = getCurrentStoryId();
        if (storyId === currentId) {
          if (isRevealed) {
            applyVotesToUI(votes, false);
            handleVotesRevealed(storyId, votes);  // ✅ Render stats layout
          } else {
            applyVotesToUI(votes, true);
          }
        } else if (isRevealed) {
          // ✅ ALSO render stats layout for other stories if needed
          handleVotesRevealed(storyId, votes);
        }
      }
    }
console.log('[RESTORE] Skipped manual session restoration — server handles vote recovery');

   
    window.currentVotesPerStory = votesPerStory;
    refreshVoteDisplay();
  });
  
  // Updated deleteStory event handler to track deletions locally
  socket.on('deleteStory', ({ storyId }) => {
    console.log('[SOCKET] Story deletion event received:', storyId);
    
    // Add to local deletion tracking
    deletedStoryIds.add(storyId);
    
    // Save to session storage
    saveDeletedStoriesToStorage(roomId);
    
    // Remove from DOM
    const el = document.getElementById(storyId);
    if (el) {
      el.remove();
      normalizeStoryIndexes();
    }
    
    // Clear vote data for the deleted story
    delete votesPerStory[storyId];
    delete votesRevealed[storyId];
  });
  
  socket.on('votesRevealed', ({ storyId }) => {
    if (deletedStoryIds.has(storyId)) return;
    
    // Skip if already revealed to avoid duplicate animations
    if (votesRevealed[storyId] === true) {
      console.log(`[VOTE] Votes already revealed for story ${storyId}, not triggering effects again`);
      return;
    }
    
    votesRevealed[storyId] = true;
    const votes = votesPerStory[storyId] || {};
    
    // Hide planning cards for this story
    const planningCardsSection = document.querySelector('.planning-cards-section');
    if (planningCardsSection) {
      planningCardsSection.classList.add('hidden-until-init');
      planningCardsSection.style.display = 'none';
    }
    
    handleVotesRevealed(storyId, votes);
    
    // Log action for debugging
    console.log(`[VOTE] Votes revealed for story: ${storyId}, stats should now be visible`);
  })

  socket.on('votesReset', ({ storyId }) => {
    if (deletedStoryIds.has(storyId)) return;

    if (votesPerStory[storyId]) {
      votesPerStory[storyId] = {};
    }

    votesRevealed[storyId] = false;
    resetAllVoteVisuals();

    // Always show planning cards and hide stats for this story
    const planningCardsSection = document.querySelector('.planning-cards-section');
    if (planningCardsSection) {
      planningCardsSection.classList.remove('hidden-until-init');
      planningCardsSection.style.display = 'block';
    }

    // Hide all stats containers that match this story ID
    const statsContainers = document.querySelectorAll(`.vote-statistics-container[data-story-id="${storyId}"]`);
    statsContainers.forEach(container => {
      container.style.display = 'none';
    });
    
    // Log reset action for debugging
    console.log(`[VOTE] Votes reset for story: ${storyId}, planning cards should now be visible`);
  });
  
// Improve the storySelected event handler
socket.on('storySelected', ({ storyIndex, storyId }) => {
  console.log('[SOCKET] storySelected received:', storyIndex, storyId);
  clearAllVoteVisuals();
  // If storyId is provided directly, use it
  if (storyId) {
    // Select the story
    selectStory(storyIndex, false);
    return;
  }
  
  // If no storyId was provided, try to resolve it from the index
  if (typeof storyIndex === 'number') {
    // Try to find the story card by index
    const storyCards = document.querySelectorAll('.story-card');
    if (storyIndex >= 0 && storyIndex < storyCards.length) {
      const targetCard = storyCards[storyIndex];
      if (targetCard && targetCard.id) {
        console.log(`[SOCKET] Resolved storyId from index ${storyIndex}: ${targetCard.id}`);
        selectStory(storyIndex, false);
        return;
      }
    }
    
    // If we still can't find the story, try one more approach:
    // Find any story card with the matching data-index attribute
    const indexCard = document.querySelector(`.story-card[data-index="${storyIndex}"]`);
    if (indexCard && indexCard.id) {
      console.log(`[SOCKET] Found story card using data-index=${storyIndex}: ${indexCard.id}`);
      selectStory(storyIndex, false);
      return;
    }
  }
  
  console.warn(`[SOCKET] Could not resolve story for index ${storyIndex}`);
});
  
  // Add reconnection handlers for socket
  if (socket) {
    // New handler for reconnect attempts
    socket.on('reconnect_attempt', (attempt) => {
      console.log(`[SOCKET] Reconnection attempt ${attempt}`);
      reconnectingInProgress = true;
      
      // Update UI to show reconnecting status
      updateConnectionStatus('reconnecting');
    });
    
    // Handle successful reconnection
    socket.on('reconnect', () => {
      console.log('[SOCKET] Reconnected to server');
      reconnectingInProgress = false;
      
      // Update UI to show connected status
      updateConnectionStatus('connected');

      // Request current state and story
      socket.emit('requestAllTickets');
      socket.emit('requestCurrentStory');
      setTimeout(() => {
        socket.emit('requestFullStateResync');

        // Re-apply stored votes
        if (typeof getUserVotes === 'function') {
          const userVotes = getUserVotes();
          for (const [storyId, vote] of Object.entries(userVotes)) {
            if (deletedStoryIds.has(storyId)) continue;

            if (!votesPerStory[storyId]) votesPerStory[storyId] = {};
            votesPerStory[storyId][socket.id] = vote;
            window.currentVotesPerStory = votesPerStory;

            const currentId = getCurrentStoryId();
            if (storyId === currentId) {
              updateVoteVisuals(socket.id, votesRevealed[storyId] ? vote : '👍', true);
            }
          }

          refreshVoteDisplay();
        }
      }, 500);
    });
  }
  
  // Guest: Listen for host's voting system
  socket.on('votingSystemUpdate', ({ votingSystem }) => {
    console.log('[SOCKET] Received voting system from host:', votingSystem);
    sessionStorage.setItem('votingSystem', votingSystem);
    setupPlanningCards(); // Dynamically regenerate vote cards
  });

  // Host: Emit selected voting system to server
  const isHost = sessionStorage.getItem('isHost') === 'true';
  const votingSystem = sessionStorage.getItem('votingSystem') || 'fibonacci';

  if (isHost && socket) {
    socket.emit('votingSystemSelected', { roomId, votingSystem });
  }

  updateHeaderStyle();
  addFixedVoteStatisticsStyles();
  setupCSVUploader();
  setupInviteButton();
  setupStoryNavigation();
  setupPlanningCards(); // generates the cards AND sets up drag listeners
  setupRevealResetButtons();
  setupAddTicketButton();
  setupGuestModeRestrictions(); // Add guest mode restrictions
  setupStoryCardInteractions();
  
  // Add these cleanup and setup calls for delete buttons
  cleanupDeleteButtonHandlers();
  setupCSVDeleteButtons();
  
  // Add CSS for new layout
  addNewLayoutStyles();
  
  // Refresh votes periodically to ensure everyone sees the latest votes
  setInterval(refreshCurrentStoryVotes, 30000); // Check every 30 seconds
// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.story-actions')) {
    document.querySelectorAll('.story-menu-dropdown.show').forEach(dropdown => {
      dropdown.classList.remove('show');
    });
  }
});
  
}

/**
 * Periodically refresh votes for the current story
 */
function refreshCurrentStoryVotes() {
  if (!socket || !socket.connected) return;
  
  const storyId = getCurrentStoryId();
  
  // Skip for deleted stories or when no story is selected
  if (!storyId || deletedStoryIds.has(storyId)) return;
  
  // Only request votes if we haven't already revealed them
  // This prevents unnecessary traffic and potential re-animation
  if (!votesRevealed[storyId]) {
    console.log(`[AUTO] Refreshing votes for current story: ${storyId}`);
    socket.emit('requestStoryVotes', { storyId });
  }
}

function updateHeaderStyle() {
  // Implement if needed
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
    .disabled-nav {
      opacity: 0.4;
      pointer-events: none;
      cursor: not-allowed;
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
    /* Update the card styling to be thinner */
    .card {
      width: 45px; /* Reduced from original width */
      height: 50px; /* Maintain proportion */
      padding: 10px;
      background: #cfc6f7; /* Light purple background matching your image */
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      font-size: 18px;
      text-align: center;
      transition: transform 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 5px;
    }
    
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    /* Make cards properly align and wrap */
    .cards {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      padding: 10px 0;
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
      font-size: 18px;
      font-weight: bold;
      color: #673ab7 !important; /* Purple color matching your theme */
      opacity: 1 !important;
      transition: none; /* Prevent any transitions that might delay visibility */
    }
     /* Add styles to ensure visibility in vote card spaces */
    .vote-card-space .vote-badge {
      font-size: 24px;
      visibility: visible !important;
    }
    
    /* Make sure the thumbs up is visible in the has-vote state */
    .vote-card-space.has-vote .vote-badge {
      display: block !important;
      color: #673ab7 !important;
    }
    
    .reveal-button-container {
      margin: 10px 0;
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .global-emoji-burst {
      position: fixed;
      font-size: 2rem;
      pointer-events: none;
      opacity: 0;
      transform: scale(0.5) translateY(0);
      transition: transform 0.8s ease-out, opacity 0.8s ease-out;
      z-index: 9999;
    }

    .global-emoji-burst.burst-go {
      opacity: 1;
      transform: scale(1.5) translateY(-100px);
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
    .disabled-story {
      pointer-events: none;
      opacity: 0.6;
      cursor: not-allowed;
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
    .own-vote-space {
      border: 2px dashed #673ab7;
      position: relative;
    }
    
    .own-vote-space::after {
      content: 'Your vote';
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: #673ab7;
      white-space: nowrap;
    }
    
    /* Add styles for the drop-not-allowed state */
    .vote-card-space.drop-not-allowed {
      border-color: #f44336;
      background-color: #ffebee;
      position: relative;
    }
    
    .vote-card-space.drop-not-allowed::before {
      content: '✕';
      position: absolute;
      color: #f44336;
      font-size: 24px;
      font-weight: bold;
      opacity: 0.8;
    }
     /* Delete button styles */
    .story-delete-btn {
      position: absolute;
      right: 8px;
      top: 8px;
      width: 20px;
      height: 20px;
      background-color: #f44336;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 2;
    }
    
    .story-delete-btn:hover {
      opacity: 1;
      transform: scale(1.1);
    }
    
    /* Make sure story cards properly handle the delete button position */
    .story-card {
      position: relative;
      padding-right: 35px;
    }
    
    /* Connection status indicator */
    .connection-status {
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      color: white;
      background-color: #4caf50;
      transition: all 0.3s ease;
      opacity: 0;
      z-index: 9999;
    }
    
    .connection-status.reconnecting {
      background-color: #ff9800;
      opacity: 1;
    }
    
    .connection-status.error {
      background-color: #f44336;
      opacity: 1;
    }
    
    .connection-status.connected {
      opacity: 1;
      animation: fadeOut 2s ease 2s forwards;
    }
    
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // Create connection status indicator
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'connection-status';
  statusIndicator.id = 'connectionStatus';
  statusIndicator.textContent = 'Connected';
  document.body.appendChild(statusIndicator);
  
  // Show initial connected state briefly
  statusIndicator.classList.add('connected');
  setTimeout(() => {
    statusIndicator.classList.remove('connected');
  }, 4000);
}

/**
 * Update connection status UI
 * @param {string} status - 'connected', 'reconnecting', or 'error'
 */
function updateConnectionStatus(status) {
  const statusIndicator = document.getElementById('connectionStatus');
  if (!statusIndicator) return;
  
  // Remove all classes first
  statusIndicator.classList.remove('connected', 'reconnecting', 'error');
  
  // Set text and add appropriate class
  switch (status) {
    case 'connected':
      statusIndicator.textContent = 'Connected';
      statusIndicator.classList.add('connected');
      break;
    case 'reconnecting':
      statusIndicator.textContent = 'Reconnecting...';
      statusIndicator.classList.add('reconnecting');
      break;
    case 'error':
      statusIndicator.textContent = 'Connection Error';
      statusIndicator.classList.add('error');
      break;
  }
}

/**
 * This function removes all delete button direct event listeners
 */
function cleanupDeleteButtonHandlers() {
  const deleteButtons = document.querySelectorAll('.story-delete-btn');
  deleteButtons.forEach(btn => {
    // Clone the button to remove all event listeners
    const newBtn = btn.cloneNode(true);
    if (btn.parentNode) {
      btn.parentNode.replaceChild(newBtn, btn);
    }
  });
  console.log(`[CLEANUP] Removed event listeners from ${deleteButtons.length} delete buttons`);
}

/**
 * Setup delegation-based event handling for CSV story delete buttons
 * NOTE: This is now disabled since we use 3-dot menus
 */
function setupCSVDeleteButtons() {
  // Disabled - we now use 3-dot menus instead
  console.log('[SETUP] CSV delete button handler disabled - using 3-dot menus instead');
}

/**
 * Delete a story by ID with duplicate confirmation prevention
 */
function deleteStory(storyId) {
  console.log('[DELETE] Attempting to delete story:', storyId);
  
  // Prevent multiple confirmation dialogs
  if (deleteConfirmationInProgress) {
    console.log('[DELETE] Delete confirmation already in progress, ignoring duplicate call');
    return;
  }
  
  deleteConfirmationInProgress = true;
  
  // Confirm deletion
  const confirmResult = confirm('Are you sure you want to delete this story?');
  
  // Reset the flag regardless of result
  setTimeout(() => {
    deleteConfirmationInProgress = false;
  }, 100);
  
  if (!confirmResult) {
    console.log('[DELETE] User canceled deletion');
    return;
  }
  
  // Get the story element BEFORE we do anything else
  const storyCard = document.getElementById(storyId);
  if (!storyCard) {
    console.error('[DELETE] Story card not found:', storyId);
    return;
  }

  console.log('[DELETE] Found story card, proceeding with deletion');
  
  // Mark as deleted in our local tracking
  deletedStoryIds.add(storyId);
  
  // Save to session storage
  const roomId = getRoomIdFromURL();
  saveDeletedStoriesToStorage(roomId);
  
  // Get story index before removal (for selection adjustment)
  const index = parseInt(storyCard.dataset.index);
  
  // Check if this is a CSV story
  const isCsvStory = storyId.startsWith('story_csv_');
  
  // **IMPORTANT: We'll emit to server BEFORE removing from DOM**
  if (socket) {
    console.log('[DELETE] Emitting deleteStory event to server');
    
    if (isCsvStory) {
      // For CSV stories, extract the index and send additional info
      const csvIndex = parseInt(storyId.replace('story_csv_', ''));
      socket.emit('deleteStory', { storyId, isCsvStory: true, csvIndex });
    } else {
      // For regular stories
      socket.emit('deleteStory', { storyId });
    }
  } else {
    console.warn('[DELETE] Socket not available, deleting locally only');
  }
  
  // Remove from the DOM
  storyCard.remove();
  
  // Clear vote data for this story
  delete votesPerStory[storyId];
  delete votesRevealed[storyId];
  
  // After removal, select another item if needed
  if (index === currentStoryIndex) {
    const storyList = document.getElementById('storyList');
    if (storyList && storyList.children.length > 0) {
      // Choose the next story, or the last one if we deleted the last
      const newIndex = Math.min(index, storyList.children.length - 1);
      selectStory(newIndex, true); // Emit to server because we're selecting
    }
  }
  
  // Renumber the remaining stories
  normalizeStoryIndexes();
  
  console.log('[DELETE] Deletion complete for story:', storyId);
}


function createVoteStatisticsDisplay(votes) {
  // Create container
  const container = document.createElement('div');
  container.className = 'vote-statistics-display';
  
  // Calculate statistics
  const voteValues = Object.values(votes);
  const numericValues = voteValues
    .filter(v => !isNaN(parseFloat(v)) && v !== null && v !== undefined)
    .map(v => parseFloat(v));
  
  // Default values
  let mostCommonVote = voteValues.length > 0 ? voteValues[0] : 'No votes';
  let voteCount = voteValues.length;
  let averageValue = 0;
  let agreementPercent = 0;
  
  // Calculate statistics if we have numeric values
  if (numericValues.length > 0) {
    // Find most common vote
    const voteFrequency = {};
    let maxCount = 0;
    
    voteValues.forEach(vote => {
      voteFrequency[vote] = (voteFrequency[vote] || 0) + 1;
      if (voteFrequency[vote] > maxCount) {
        maxCount = voteFrequency[vote];
        mostCommonVote = vote;
      }
    });
    
    // Calculate average
    averageValue = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    averageValue = Math.round(averageValue * 10) / 10; // Round to 1 decimal place
    
    // Calculate agreement percentage
    agreementPercent = (maxCount / voteValues.length) * 100;
  }
  
  // Create HTML that matches your CSS classes
  container.innerHTML = `
    <div class="vote-chart">
      <div class="vote-card-box">
        <div class="vote-value">${mostCommonVote}</div>
      </div>
      <div class="vote-count">${voteCount} Vote${voteCount !== 1 ? 's' : ''}</div>
    </div>
    <div class="vote-stats">
      <div class="stat-row">
        <div class="stat-label">Average:</div>
        <div class="stat-value">${averageValue}</div>
      </div>
      <div class="stat-row">
        <div class="stat-label">Agreement:</div>
        <div class="stat-circle" style="background-color: ${getAgreementColor(agreementPercent)}">
          <div class="agreement-icon">👍</div>
        </div>
      </div>
    </div>
  `;
  
  return container;
}

// Helper function to find most common vote
function findMostCommonVote(votes) {
  const voteValues = Object.values(votes);
  const counts = {};
  
  voteValues.forEach(vote => {
    counts[vote] = (counts[vote] || 0) + 1;
  });
  
  let maxCount = 0;
  let mostCommon = '';
  
  for (const vote in counts) {
    if (counts[vote] > maxCount) {
      maxCount = counts[vote];
      mostCommon = vote;
    }
  }
  
  return mostCommon;
}

// Helper to get color based on agreement percentage
function getAgreementColor(percentage) {
  if (percentage === 100) return '#00e676'; // Perfect agreement - green
  if (percentage >= 75) return '#76ff03';  // Good agreement - light green
  if (percentage >= 50) return '#ffeb3b';  // Medium agreement - yellow
  if (percentage >= 0) return '#FFEB3B';
  return '#ff9100';  // Low agreement - orange
}

function addVoteStatisticsStyles() {
  // Implement if needed
}

/**
 * Handle votes revealed event by showing statistics
 * @param {number} storyId - ID of the story
 * @param {Object} votes - Vote data
 */

function handleVotesRevealed(storyId, votes) {
  if (!votes || typeof votes !== 'object') return;
  
  // Ensure style block is added for vote statistics
  if (typeof addFixedVoteStatisticsStyles === 'function') {
    addFixedVoteStatisticsStyles();
  }

  // First, apply the votes to the UI
  applyVotesToUI(votes, false);

  // CRITICAL PART: Create a username → vote map that completely ignores socket IDs
  const userMap = window.userMap || {};
  const usernameToVoteMap = new Map();

  // -----------------------------------------------------
  // FIRST STEP: Build a complete mapping of user → votes
  // -----------------------------------------------------
  // For each vote in the input, map it to a username
  Object.entries(votes).forEach(([socketId, vote]) => {
    const userName = userMap[socketId] || socketId;
    
    // Store this vote for this username
    if (!usernameToVoteMap.has(userName)) {
      usernameToVoteMap.set(userName, { vote, socketIds: [socketId] });
    } else {
      // User already has a vote registered, record this socket ID
      usernameToVoteMap.get(userName).socketIds.push(socketId);
    }
  });

  // -----------------------------------------------------
  // SECOND STEP: Log the deduplication for debugging
  // -----------------------------------------------------
  let duplicateVotesFound = false;
  usernameToVoteMap.forEach((data, userName) => {
    if (data.socketIds.length > 1) {
      duplicateVotesFound = true;
      console.log(`[DEDUP] User ${userName} has ${data.socketIds.length} socket IDs with votes`);
    }
  });

  if (duplicateVotesFound) {
    console.log('[DEDUP] Found duplicate votes! Original count:', Object.keys(votes).length, 
      'Deduplicated count:', usernameToVoteMap.size);
  }

  // -----------------------------------------------------
  // THIRD STEP: Extract ONLY unique votes (one per user)
  // -----------------------------------------------------
  const uniqueVoteValues = Array.from(usernameToVoteMap.values()).map(data => data.vote);

  // -----------------------------------------------------
  // FOURTH STEP: Calculate statistics
  // -----------------------------------------------------
  // Parse numeric values for average calculation
  function parseNumericVote(vote) {
    if (typeof vote !== 'string' && typeof vote !== 'number') return NaN;
    if (vote === '½') return 0.5;
    if (vote === '?' || vote === '☕' || vote === '∞') return NaN;

    // Handle T-shirt sizes with numbers in parentheses
    if (typeof vote === 'string') {
      const match = vote.match(/\((\d+(?:\.\d+)?)\)$/);
      if (match) return parseFloat(match[1]);
    }

    const parsed = parseFloat(vote);
    return isNaN(parsed) ? NaN : parsed;
  }

  const numericValues = uniqueVoteValues.map(parseNumericVote).filter(v => !isNaN(v));

  // Default values
  let mostCommonVote = uniqueVoteValues.length > 0 ? uniqueVoteValues[0] : '0';
  let averageValue = null;

  // Calculate statistics if we have votes
  if (uniqueVoteValues.length > 0) {
    // Find most common vote
    const frequency = {};
    let maxFreq = 0;

    uniqueVoteValues.forEach(vote => {
      frequency[vote] = (frequency[vote] || 0) + 1;
      if (frequency[vote] > maxFreq) {
        maxFreq = frequency[vote];
        mostCommonVote = vote;
      }
    });

    // Calculate average if we have numeric values
    if (numericValues.length > 0) {
      averageValue = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      averageValue = Math.round(averageValue * 10) / 10;
    }
  }

  // Log final statistics data
  console.log(`[VOTES] Showing stats for ${usernameToVoteMap.size} unique users (${Object.keys(votes).length} total votes)`);
  console.log(`[VOTES] Most common: ${mostCommonVote}, Average: ${averageValue}`);

  // -----------------------------------------------------
  // FIFTH STEP: Create statistics UI
  // -----------------------------------------------------
  // Remove any existing stats containers for this story
  const existingStatsContainers = document.querySelectorAll(`.vote-statistics-container[data-story-id="${storyId}"]`);
  existingStatsContainers.forEach(el => el.remove());

  // Create the stats container
  const statsContainer = document.createElement('div');
  statsContainer.className = 'vote-statistics-container';
  statsContainer.setAttribute('data-story-id', storyId);
  
  // Use the deduplicated count for the UI display - this is critical!
  const voteCount = usernameToVoteMap.size;
  
  statsContainer.innerHTML = `
    <div class="fixed-vote-display">
      <div class="fixed-vote-card">
        ${mostCommonVote}
        <div class="fixed-vote-count">${voteCount} Vote${voteCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="fixed-vote-stats">
        ${averageValue !== null ? `
          <div class="fixed-stat-group">
            <div class="fixed-stat-label">Average:</div>
            <div class="fixed-stat-value">${averageValue}</div>
          </div>` : ''}
        <div class="fixed-stat-group">
          <div class="fixed-stat-label">Agreement:</div>
          <div class="fixed-agreement-circle">
            <div class="agreement-icon">👍</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Insert the stats container into the DOM
  const planningCardsSection = document.querySelector('.planning-cards-section');
  const currentStoryCard = document.querySelector('.story-card.selected');

  if (planningCardsSection && planningCardsSection.parentNode) {
    planningCardsSection.classList.add('hidden-until-init');
    planningCardsSection.style.display = 'none';
    planningCardsSection.parentNode.insertBefore(statsContainer, planningCardsSection.nextSibling);
  } else if (currentStoryCard && currentStoryCard.parentNode) {
    currentStoryCard.parentNode.insertBefore(statsContainer, currentStoryCard.nextSibling);
  } else {
    document.body.appendChild(statsContainer);
  }

  statsContainer.style.display = 'block';
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
        
        // Check if this ID is in our deleted set
        if (deletedStoryIds.has(ticketData.id)) {
          console.log('[ADD] Cannot add previously deleted ticket:', ticketData.id);
          return;
        }
        
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

function getVoteEmoji(vote) {
  const map = {
    '1': '🟢',
    '2': '🟡',
    '3': '🔴',
    '5': '🚀',
    '8': '🔥',
    '?': '❓',
    '👍': '👍'
  };
  return map[vote] || '🎉';
}
/**
 * Add a ticket to the UI with 3-dot menu
 * @param {Object} ticketData - Ticket data { id, text }
 * @param {boolean} selectAfterAdd - Whether to select the ticket after adding
 */

function addTicketToUI(ticketData, selectAfterAdd = false) {
  if (!ticketData || !ticketData.id || !ticketData.text) return;

  // Check if this ticket is in our deleted set
  if (deletedStoryIds.has(ticketData.id)) {
    console.log('[ADD] Not adding deleted ticket to UI:', ticketData.id);
    return;
  }

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

  // Detect fields for proper display and attribute storage
  // Accept ticketData.idDisplay and .descriptionDisplay as explicit overrides from CSV import
  const idForDisplay = ticketData.idDisplay !== undefined ? ticketData.idDisplay : (
    ticketData.id.startsWith('story_csv_') && ticketData.id.replace(/^story_csv_/, '') !== '' ? ticketData.id.replace(/^story_csv_/, '') : ticketData.id
  );
  const descriptionForDisplay = ticketData.descriptionDisplay !== undefined ? ticketData.descriptionDisplay : ticketData.text;

  // Store these as data attributes for editStory to use
  storyCard.dataset.id = idForDisplay;
  storyCard.dataset.description = descriptionForDisplay;

  // Create the story title element
  const storyTitle = document.createElement('div');
  storyTitle.className = 'story-title';
  // Display as "ID: Description" if both exist and ID is non-empty
  if (idForDisplay && descriptionForDisplay) {
    storyTitle.textContent = `${idForDisplay}: ${descriptionForDisplay}`;
  } else {
    storyTitle.textContent = descriptionForDisplay;
  }

  // Add to DOM
  storyCard.appendChild(storyTitle);

  // Add 3-dot menu for hosts only
  if (isCurrentUserHost()) {
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'story-actions';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'story-menu-btn';
    menuBtn.innerHTML = '⋮'; // 3 vertical dots
    menuBtn.title = 'Story actions';

    const dropdown = document.createElement('div');
    dropdown.className = 'story-menu-dropdown';

    const editItem = document.createElement('div');
    editItem.className = 'story-menu-item edit';
    editItem.innerHTML = '<i class="fas fa-edit"></i> Edit';

    const deleteItem = document.createElement('div');
    deleteItem.className = 'story-menu-item delete';
    deleteItem.innerHTML = '<i class="fas fa-trash"></i> Delete';

    dropdown.appendChild(editItem);
    dropdown.appendChild(deleteItem);

    actionsContainer.appendChild(menuBtn);
    actionsContainer.appendChild(dropdown);
    storyCard.appendChild(actionsContainer);

    // Add event listeners
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      // Close all other dropdowns first
      document.querySelectorAll('.story-menu-dropdown.show').forEach(dd => {
        if (dd !== dropdown) dd.classList.remove('show');
      });

      dropdown.classList.toggle('show');
    });

    editItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      // Pass both data fields for editStory (for popup prefill)
      editStory({
        id: ticketData.id,
        idDisplay: storyCard.dataset.id,
        descriptionDisplay: storyCard.dataset.description,
        text: storyTitle.textContent
      });
    });

    deleteItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      deleteStory(ticketData.id);
    });
  }

  storyList.appendChild(storyCard);

  // Check if user is guest and handle accordingly
  if (isGuestUser()) {
    storyCard.classList.add('disabled-story');
  } else {
    // Add click event listener
    storyCard.addEventListener('click', () => {
      selectStory(newIndex);
    });
  }

  // Select the new story if requested (only for hosts)
  if (selectAfterAdd && !isGuestUser()) {
    selectStory(newIndex);
  }

  // Check for stories message
  const noStoriesMessage = document.getElementById('noStoriesMessage');
  if (noStoriesMessage) {
    noStoriesMessage.style.display = 'none';
  }

  // Enable planning cards if they were disabled
  document.querySelectorAll('#planningCards .card').forEach(card => {
    card.classList.remove('disabled');
    card.setAttribute('draggable', 'true');
  });

  normalizeStoryIndexes();
}

/**
 * Set up a mutation observer to catch any newly added story cards
 */
function setupStoryCardObserver() {
  if (!isGuestUser()) return; // Only needed for guests
  
  const storyList = document.getElementById('storyList');
  if (!storyList) return;
  
  // Create a mutation observer
  const observer = new MutationObserver((mutations) => {
    let needsUpdate = false;
    
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      applyGuestRestrictions();
    }
  });
  
  // Start observing
  observer.observe(storyList, { 
    childList: true, 
    subtree: true 
  });
}
/**
 * Apply guest restrictions to all story cards
 * This ensures manually added cards are also properly restricted
 */
function applyGuestRestrictions() {
  if (!isGuestUser()) return; // Only apply to guests
  
  // Select all story cards
  const storyCards = document.querySelectorAll('.story-card');
  
  storyCards.forEach(card => {
    // Make sure the card has the disabled class
    card.classList.add('disabled-story');
    
    // Remove all click events by cloning and replacing - except for the 3-dot menu
    const actionsContainer = card.querySelector('.story-actions');
    if (actionsContainer) {
          
      const menuBtn = actionsContainer.querySelector('.story-menu-btn');
      const dropdown = actionsContainer.querySelector('.story-menu-dropdown');
      
       if (menuBtn && dropdown) {

              // Do not add remove event listener
        }
      } else {
             const newCard = card.cloneNode(true);
             if (card.parentNode) {
               card.parentNode.replaceChild(newCard, card);
             }
      }
    
  });
}



/**
 * Process multiple tickets at once (used when receiving all tickets from server)
 * @param {Array} tickets - Array of ticket data objects
 */
function processAllTickets(tickets) {
  const filtered = tickets.filter(ticket => !deletedStoryIds.has(ticket.id));
  console.log(`[TICKETS] Processing ${filtered.length} tickets (filtered from ${tickets.length})`);

  const storyList = document.getElementById('storyList');
  if (storyList) {
    const manualCards = storyList.querySelectorAll('.story-card[id^="story_"]:not([id^="story_csv_"])');
    manualCards.forEach(card => card.remove());
  }

  filtered.forEach(ticket => {
    if (ticket?.id && ticket?.text) {
      addTicketToUI(ticket, false);
    }
  });

  if (filtered.length > 0) {
    if (currentStoryIndex === null || currentStoryIndex === undefined || currentStoryIndex < 0 || currentStoryIndex >= filtered.length) {
      currentStoryIndex = 0;
      selectStory(0, false);
    } else {
      console.log('[INIT] Skipping auto-select, currentStoryIndex already set:', currentStoryIndex);
      // 🛠️ Add this line to re-highlight the story in UI
      selectStory(currentStoryIndex, false);
    }
  }

  if (isGuestUser()) {
    applyGuestRestrictions();
  }
}

// Get storyId from selected card
function getCurrentStoryId() {
  const selectedCard = document.querySelector('.story-card.selected');
  return selectedCard ? selectedCard.id : null;
}

/**
 * Setup reveal and reset buttons
 */
function setupRevealResetButtons() {
  const revealVotesBtn = document.getElementById('revealVotesBtn');
  if (revealVotesBtn) {
    revealVotesBtn.addEventListener('click', () => {
      const storyId = getCurrentStoryId();
      if (socket && storyId) {
        console.log('[UI] Revealing votes for story:', storyId);
        
        // IMPORTANT FIX: Update local state BEFORE emitting to server
        votesRevealed[storyId] = true;
        
        // Get the votes for this story
        const votes = votesPerStory[storyId] || {};
        
        // Update UI immediately for host without waiting for server response
        applyVotesToUI(votes, false);
        
        // Hide planning cards
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.add('hidden-until-init');
          planningCardsSection.style.display = 'none';
        }
        
        // Show statistics immediately for host
        handleVotesRevealed(storyId, votes);
        
        // Trigger emoji effect
        triggerGlobalEmojiBurst();
        
        // Then emit to server for other users
        socket.emit('revealVotes', { storyId });
      }
    });
  }

  const resetVotesBtn = document.getElementById('resetVotesBtn');
  if (resetVotesBtn) {
    resetVotesBtn.addEventListener('click', () => {
      const storyId = getCurrentStoryId();
      if (socket && storyId) {
        // IMPORTANT: Update local state BEFORE emitting to server
        if (votesPerStory[storyId]) {
          votesPerStory[storyId] = {};
        }
        votesRevealed[storyId] = false;
        
        // Update UI immediately
        resetAllVoteVisuals();
        
        // Show planning cards
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.remove('hidden-until-init');
          planningCardsSection.style.display = 'block';
        }
        
        // Hide stats container
        const statsContainer = document.querySelector(`.vote-statistics-container[data-story-id="${storyId}"]`);
        if (statsContainer) {
          statsContainer.style.display = 'none';
        }
        
        // Then emit to server
        socket.emit('resetVotes', { storyId });
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
        // Skip if this ticket is in our deleted set
        if (deletedStoryIds.has(ticket.id)) {
          console.log('[CSV] Not re-adding deleted manual ticket:', ticket.id);
          return;
        }
        
        // Make sure this ticket isn't already in the list to avoid duplicates
        if (!document.getElementById(ticket.id)) {
          addTicketToUI(ticket, false);
        }
      });
      
      // Store these for future preservation
      preservedManualTickets = [...existingTickets];
      
      // Emit the CSV data to server AFTER ensuring all UI is updated
      emitCSVData(parsedData);
      
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

function parseCSV(text) {
  const delimiter = text.includes('\t') ? '\t' : ',';
  console.log(`[CSV] Detected delimiter: ${delimiter === '\t' ? 'tab' : 'comma'}`);

  // Normalize lines and split on delimiter
  const rows = text
    .trim()
    .split('\n')
    .filter(row => row.trim().length > 0)
    .map(row => row.split(delimiter).map(cell => cell.trim()));

  if (rows.length === 0) {
    console.log("[CSV] No rows to parse");
    return [];
  }

  // Identify if headers exist (case-insensitive, whitespace-tolerant)
  const headersNormalized = rows[0].map(h => h.replace(/\s/g, '').toLowerCase());
  const idIdx = headersNormalized.indexOf('id');
  const descIdx = headersNormalized.indexOf('description');
  const hasHeaders = idIdx !== -1 && descIdx !== -1;
  console.log(`[CSV] Headers detected: ${hasHeaders}`);

  let parsed = [];

  if (hasHeaders) {
    // Skip the header row
    parsed = rows.slice(1).map((row, i) => ({
      Id: row[idIdx] || `csv_${i}`,
      Description: row[descIdx] || 'Untitled',
    })).filter(entry =>
      (entry.Id && entry.Id.toLowerCase() !== "id") ||
      (entry.Description && entry.Description.toLowerCase() !== "description")
    );
  } else {
    parsed = rows.map((row, i) => {
      const id = row[0] || `csv_${i}`;
      const desc = row[1] || 'Untitled';
      // Don't add empty rows
      if (!id && !desc) return null;
      return {
        Id: id,
        Description: desc,
      };
    }).filter(Boolean);
  }

  console.log(`[CSV] Parsed ${parsed.length} valid entries`);
  return parsed;
}





function normalizeStoryIndexes() {
  const storyList = document.getElementById('storyList');
  if (!storyList) return;

  const storyCards = storyList.querySelectorAll('.story-card');
  storyCards.forEach((card, index) => {
    card.dataset.index = index;
    card.onclick = () => selectStory(index); // ensure correct click behavior
  });
}

/**
 * Display CSV data in the story list
 */

function displayCSVData(data) {
  if (processingCSVData) {
    console.log('[CSV] Already processing CSV data, ignoring reentrant call');
    return;
  }

  processingCSVData = true;

  try {
    const storyListContainer = document.getElementById('storyList');
    if (!storyListContainer) return;

    console.log(`[CSV] Displaying ${data.length} rows of CSV data with 3-dot menus`);

    const existingStories = [];
    const manualStories = storyListContainer.querySelectorAll('.story-card[id^="story_"]:not([id^="story_csv_"])');

    manualStories.forEach(card => {
      if (deletedStoryIds.has(card.id)) return;

      const title = card.querySelector('.story-title');
      if (title) {
        // Try to grab any previously set data attributes for id/description
        existingStories.push({
          id: card.id,
          idDisplay: card.dataset.id || '',
          descriptionDisplay: card.dataset.description || '',
          text: title.textContent
        });
      }
    });

    console.log(`[CSV] Saved ${existingStories.length} existing manual stories`);

    // Remove only CSV stories
    storyListContainer.querySelectorAll('.story-card[id^="story_csv_"]').forEach(card => card.remove());

    // Clear and rebuild all stories
    storyListContainer.innerHTML = '';

    // Re-add manual stories in the new format
    existingStories.forEach((story, index) => {
      if (deletedStoryIds.has(story.id)) return;

      const storyItem = document.createElement('div');
      storyItem.classList.add('story-card');
      storyItem.id = story.id;
      storyItem.dataset.index = index;
      storyItem.dataset.id = story.idDisplay || '';
      storyItem.dataset.description = story.descriptionDisplay || '';

      const storyTitle = document.createElement('div');
      storyTitle.classList.add('story-title');
      // Display as "ID: Description" if both exist
      if (story.idDisplay && story.descriptionDisplay) {
        storyTitle.textContent = `${story.idDisplay}: ${story.descriptionDisplay}`;
      } else {
        storyTitle.textContent = story.text;
      }
      storyItem.appendChild(storyTitle);

      if (isCurrentUserHost()) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'story-actions';

        const menuBtn = document.createElement('button');
        menuBtn.className = 'story-menu-btn';
        menuBtn.innerHTML = '⋮';
        menuBtn.title = 'Story actions';

        const dropdown = document.createElement('div');
        dropdown.className = 'story-menu-dropdown';

        const editItem = document.createElement('div');
        editItem.className = 'story-menu-item edit';
        editItem.innerHTML = '<i class="fas fa-edit"></i> Edit';

        const deleteItem = document.createElement('div');
        deleteItem.className = 'story-menu-item delete';
        deleteItem.innerHTML = '<i class="fas fa-trash"></i> Delete';

        dropdown.appendChild(editItem);
        dropdown.appendChild(deleteItem);
        actionsContainer.appendChild(menuBtn);
        actionsContainer.appendChild(dropdown);
        storyItem.appendChild(actionsContainer);

        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.story-menu-dropdown.show').forEach(dd => {
            if (dd !== dropdown) dd.classList.remove('show');
          });
          dropdown.classList.toggle('show');
        });

        editItem.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('show');
          // Pass both ID and description, fallback to splitting the text if needed
          editStory({
            id: story.id,
            idDisplay: storyItem.dataset.id,
            descriptionDisplay: storyItem.dataset.description,
            text: storyTitle.textContent
          });
        });

        deleteItem.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('show');
          deleteStory(story.id);
        });
      }

      storyListContainer.appendChild(storyItem);

      if (sessionStorage.getItem('isHost') === 'true') {
        storyItem.addEventListener('click', () => {
          selectStory(index);
        });
      }
    });

    // Add CSV stories (properly formatted)
    let startIndex = existingStories.length;
    data.forEach((row, index) => {
      const rawId = (row['Id'] || `csv_${index}`).trim();
      const storyText = (row['Description'] || 'Untitled').trim();
      const safeId = rawId.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const csvStoryId = `story_csv_${safeId}`;

      if (deletedStoryIds.has(csvStoryId)) {
        console.log('[CSV] Not adding deleted CSV story:', csvStoryId);
        return;
      }

      const storyItem = document.createElement('div');
      storyItem.classList.add('story-card');
      storyItem.id = csvStoryId;
      storyItem.dataset.index = startIndex + index;
      storyItem.dataset.id = rawId;
      storyItem.dataset.description = storyText;

      const storyTitle = document.createElement('div');
      storyTitle.classList.add('story-title');
      storyTitle.textContent = `${rawId}: ${storyText}`;   // << display "ID: Description"
      storyItem.appendChild(storyTitle);

      if (isCurrentUserHost()) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'story-actions';

        const menuBtn = document.createElement('button');
        menuBtn.className = 'story-menu-btn';
        menuBtn.innerHTML = '⋮';
        menuBtn.title = 'Story actions';

        const dropdown = document.createElement('div');
        dropdown.className = 'story-menu-dropdown';

        const editItem = document.createElement('div');
        editItem.className = 'story-menu-item edit';
        editItem.innerHTML = '<i class="fas fa-edit"></i> Edit';

        const deleteItem = document.createElement('div');
        deleteItem.className = 'story-menu-item delete';
        deleteItem.innerHTML = '<i class="fas fa-trash"></i> Delete';

        dropdown.appendChild(editItem);
        dropdown.appendChild(deleteItem);
        actionsContainer.appendChild(menuBtn);
        actionsContainer.appendChild(dropdown);
        storyItem.appendChild(actionsContainer);

        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.story-menu-dropdown.show').forEach(dd => {
            if (dd !== dropdown) dd.classList.remove('show');
          });
          dropdown.classList.toggle('show');
        });

        editItem.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('show');
          // Pass ID and Description for editing
          editStory({
            id: csvStoryId,
            idDisplay: storyItem.dataset.id,
            descriptionDisplay: storyItem.dataset.description,
            text: storyTitle.textContent
          });
        });

        deleteItem.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('show');
          deleteStory(csvStoryId);
        });
      }

      storyListContainer.appendChild(storyItem);

      if (!isGuestUser()) {
        storyItem.addEventListener('click', () => {
          selectStory(startIndex + index);
        });
      } else {
        storyItem.classList.add('disabled-story');
      }
    });

    preservedManualTickets = existingStories;

    console.log(`[CSV] Display complete: ${existingStories.length} manual + ${data.length} CSV = ${storyListContainer.children.length} total`);

    const noStoriesMessage = document.getElementById('noStoriesMessage');
    if (noStoriesMessage) {
      noStoriesMessage.style.display = storyListContainer.children.length === 0 ? 'block' : 'none';
    }

    const planningCards = document.querySelectorAll('#planningCards .card');
    planningCards.forEach(card => {
      if (storyListContainer.children.length === 0) {
        card.classList.add('disabled');
        card.setAttribute('draggable', 'false');
      } else {
        card.classList.remove('disabled');
        card.setAttribute('draggable', 'true');
      }
    });

    const selectedStory = storyListContainer.querySelector('.story-card.selected');
    if (!selectedStory && storyListContainer.children.length > 0) {
      storyListContainer.children[0].classList.add('selected');
      currentStoryIndex = 0;
    }

  } finally {
    normalizeStoryIndexes();
    setupStoryCardInteractions();
    processingCSVData = false;

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.story-actions')) {
        document.querySelectorAll('.story-menu-dropdown.show').forEach(dropdown => {
          dropdown.classList.remove('show');
        });
      }
    });
  }
}

/**
 * Edit a story using the add ticket modal
 * @param {Object} ticketData - The ticket data to edit
 */

function ConfirmEdit(e) {
  e.preventDefault();

  const newName = document.getElementById('ticketNameInput').value.trim();
  const newDesc = document.getElementById('ticketDescriptionInput').value.trim();
  // If both exist, format as "ID: Description", else show whichever exists
  const newDisplay = (newName && newDesc) ? `${newName}: ${newDesc}` : (newName || newDesc);

  const ticketId = window.currentEditingTicketId;
  if (!ticketId) {
    console.warn("No ticket ID available for editing.");
    return;
  }

  const storyCard = document.getElementById(ticketId);
  if (!storyCard) {
    console.warn("No story card found for ID:", ticketId);
    return;
  }

  // Update visible title
  const storyTitle = storyCard.querySelector('.story-title');
  if (storyTitle) {
    storyTitle.textContent = newDisplay;
  }
  // Update dataset attributes so future edit is pre-filled properly
  storyCard.dataset.id = newName;
  storyCard.dataset.description = newDesc;

  // Prepare the updated ticket object
  const storyObject = {
    id: ticketId,
    idDisplay: newName,
    descriptionDisplay: newDesc,
    text: newDisplay
  };

  updateTicketInUI(storyObject);

  // Notify server (and others) of UI update
  if (typeof socket !== 'undefined' && socket) {
    socket.emit('updateTicket', storyObject);
  }

  // Optionally close/hide the modal after confirming edit
  const modal = document.getElementById('addTicketModalCustom');
  if (modal) {
    modal.style.display = 'none';
  }

  // Reset edit context if desired
  window.currentEditingTicketId = null;
  window.editingTicketData = null;

  // Optionally reselect the story (or you could keep it on the same one)
  setTimeout(() => {
    selectStory(0, false);
  }, 200);
}
/** else {
    // Fallback: prompt-based editing
    console.error('[EDIT] Add ticket modal functions not available');
    const newText = prompt('Edit story text:', ticketData.text);

    if (newText && newText !== ticketData.text) {
      if (typeof ticketData.id !== 'undefined') {
        const storyCard = document.getElementById(ticketData.id);
        if (storyCard) {
          const storyTitle = storyCard.querySelector('.story-title');
          if (storyTitle) {
            storyTitle.textContent = newText;
            updateTicketInUI({ id: ticketData.id, text: newText });
            if (typeof socket !== 'undefined' && socket) {
              socket.emit('updateTicket', { id: ticketData.id, text: newText });
            }
          }
        }
      } else {
        console.warn("No valid ticket ID to update via prompt fallback");
      }
    }
  }*/
//}





/**
 * Select a story by index
 * @param {number} index - Story index to select
 * @param {boolean} emitToServer - Whether to emit to server (default: true)
 * @param {boolean} forceSelection - Whether to force selection even after retries
 */
function selectStory(index, emitToServer = true, forceSelection = false) {
    console.log('[UI] Story selected by user:', index, forceSelection ? '(forced)' : '');

    // Update UI first for responsiveness
    document.querySelectorAll('.story-card').forEach(card => {
        card.classList.remove('selected', 'active');
    });

    const storyCard = document.querySelector(`.story-card[data-index="${index}"]`);
    if (storyCard) {
        storyCard.classList.add('selected', 'active');

        // Update local state
        currentStoryIndex = index;

        // Get the story ID from the selected card
        let storyId = getCurrentStoryId();

        // Skip for deleted stories
        if (storyId && deletedStoryIds.has(storyId)) {
            console.log(`[UI] Selected story ${storyId} is marked as deleted, skipping further processing`);
            return;
        }

        // Initialize vote reveal state for this story
        if (storyId && typeof votesRevealed[storyId] === 'undefined') {
            votesRevealed[storyId] = false;
        }

        // Check if votes are revealed for this story
        const areVotesRevealed = storyId && votesRevealed[storyId] === true;
        
        if (areVotesRevealed) {
            // If votes are revealed, hide planning cards and show stats
            const planningCardsSection = document.querySelector('.planning-cards-section');
            if (planningCardsSection) {
                planningCardsSection.classList.add('hidden-until-init');
                planningCardsSection.style.display = 'none';
            }
            
            // Show statistics for this story
            setTimeout(() => {
                handleVotesRevealed(storyId, votesPerStory[storyId] || {});
            }, 100);
        } else {
            // Otherwise, ensure planning cards are visible and stats are hidden
            const planningCardsSection = document.querySelector('.planning-cards-section');
            if (planningCardsSection) {
                planningCardsSection.classList.remove('hidden-until-init');
                planningCardsSection.style.display = 'block';
            }
            
            // Hide all vote statistics containers
            const allStatsContainers = document.querySelectorAll('.vote-statistics-container');
            allStatsContainers.forEach(container => {
                container.style.display = 'none';
            });
        }

        renderCurrentStory();
        resetOrRestoreVotes(storyId);

        // Notify server about selection if requested
        const storyCards = document.querySelectorAll('.story-card');
        const storyCardFromList = storyCards[index];
        storyId = storyCardFromList ? storyCardFromList.id : null;

        if (emitToServer && socket) {
            console.log('[EMIT] Broadcasting story selection:', index);

            // Emit both storyIndex and storyId
            socket.emit('storySelected', { 
                storyIndex: index, 
                storyId: storyId 
            });

            // Request votes for this story
            if (storyId) {
                if (typeof requestStoryVotes === 'function') {
                    requestStoryVotes(storyId);
                } else {
                    socket.emit('requestStoryVotes', { storyId });
                }
            }
        }
    } else if (forceSelection) {
        console.log(`[UI] Story card with index ${index} not found yet, retrying selection soon...`);
        // Retry selection after short delay
        setTimeout(() => {
            const retryCard = document.querySelector(`.story-card[data-index="${index}"]`);
            if (retryCard) {
                selectStory(index, emitToServer, false);
            } else {
                const allCards = document.querySelectorAll('.story-card');
                let found = false;

                allCards.forEach(card => {
                    if (parseInt(card.dataset.index) === parseInt(index)) {
                        card.classList.add('selected', 'active');
                        currentStoryIndex = index;
                        found = true;

                        let storyId = card.id;
                        if (storyId && !deletedStoryIds.has(storyId)) {
                            if (typeof votesRevealed[storyId] === 'undefined') {
                                votesRevealed[storyId] = false;
                            }
                            resetOrRestoreVotes(storyId);
                        }
                    }
                });

                if (!found) {
                    console.log(`[UI] Could not find story with index ${index} after retries`);
                    currentStoryIndex = index;
                }
            }
        }, 300);
    } else {
        console.log(`[UI] Story card with index ${index} not found`);
    }
}

/**
 * Reset or restore votes for a story
 */
function resetOrRestoreVotes(storyId) {
  // Skip for deleted stories
  if (!storyId || deletedStoryIds.has(storyId)) {
    return;
  }
  
  resetAllVoteVisuals();
  
  // Make sure we have votes for this story
  if (!votesPerStory[storyId]) {
    votesPerStory[storyId] = {};
    
    // Request votes from the server (this ensures we get everyone's votes)
    if (socket && socket.connected) {
      console.log(`[VOTE] Requesting votes for story: ${storyId}`);
      socket.emit('requestStoryVotes', { storyId });
    }
    return; // We'll update the UI when the votes come back
  }
  
  // If we have stored votes for this story and they've been revealed
  if (votesRevealed[storyId]) {
    // Show the actual vote values
    applyVotesToUI(votesPerStory[storyId], false);
    
    // If votes were revealed, also show the statistics
    setTimeout(() => {
      if (votesRevealed[storyId]) {
        handleVotesRevealed(storyId, votesPerStory[storyId]);
      }
    }, 100);
  } else {
    // If we have votes but they're not revealed, still show that people voted (with thumbs up)
    if (votesPerStory[storyId]) {
      applyVotesToUI(votesPerStory[storyId], true);
    }
  }
}

/**
 * Apply votes to UI
 * @param {Object} votes - Map of user IDs to vote values
 * @param {boolean} hideValues - Whether to hide actual vote values and show thumbs up
 */
function applyVotesToUI(votes, hideValues) {
  console.log('[DEBUG] applyVotesToUI called with:', 
    { votes: JSON.stringify(votes), hideValues });
  
  Object.entries(votes).forEach(([userId, vote]) => {
    console.log(`[DEBUG] Updating vote for ${userId}: ${hideValues ? '👍' : vote}`);
    updateVoteVisuals(userId, hideValues ? '👍' : vote, true);
  });
}

/**
 * Reset all vote visuals
 */
function resetAllVoteVisuals() {
  document.querySelectorAll('.vote-badge').forEach(badge => {
    badge.textContent = '';
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
  if (!storyListContainer || csvData.length === 0) return;

  const allStoryItems = storyListContainer.querySelectorAll('.story-card');
  allStoryItems.forEach(card => card.classList.remove('active'));

  const current = allStoryItems[currentStoryIndex];
  if (current) current.classList.add('active');
  
  // Update the current story display, if present
  const currentStoryDisplay = document.getElementById('currentStory');
  if (currentStoryDisplay && csvData[currentStoryIndex]) {
    currentStoryDisplay.textContent = csvData[currentStoryIndex].join(' | ');
  }
}

/**
 * Update the user list display with the new layout
 */
function updateUserList(users) {
  const userListContainer = document.getElementById('userList');
  const userCircleContainer = document.getElementById('userCircle');
  
  if (!userListContainer || !userCircleContainer) return;

  // Clear existing content
  userListContainer.innerHTML = '';
  userCircleContainer.innerHTML = '';

  // Store the current user's ID for comparison
  const currentUserId = socket ? socket.id : null;

  // Create left sidebar user list
  users.forEach(user => {
    const userEntry = document.createElement('div');
    userEntry.classList.add('user-entry');
    userEntry.id = `user-${user.id}`;
      userEntry.innerHTML = `
      <img src="${generateAvatarUrl(user.name)}" class="avatar" alt="${user.name}">
      <span class="username">${user.name}</span>
      <span class="vote-badge"></span>
    `;
    userListContainer.appendChild(userEntry);
  });

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
    const voteCard = createVoteCardSpace(user, currentUserId === user.id);
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
      // Get the current story ID
      const storyId = getCurrentStoryId();
      
      // Skip for deleted stories
      if (storyId && deletedStoryIds.has(storyId)) {
        console.log(`[VOTE] Cannot reveal votes for deleted story: ${storyId}`);
        return;
      }
      
      if (socket && storyId) {
        console.log('[UI] Revealing votes for story:', storyId);
        
        // IMPORTANT: Update local state BEFORE emitting to server
        votesRevealed[storyId] = true;
        
        // Get the votes for this story and apply them
        const votes = votesPerStory[storyId] || {};
        applyVotesToUI(votes, false);
        
        // Hide planning cards
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.add('hidden-until-init');
          planningCardsSection.style.display = 'none';
        }
        
        // Show statistics immediately for host
        handleVotesRevealed(storyId, votes);
        
        // Trigger emoji effect
        triggerGlobalEmojiBurst();
        
        // Then emit to server for other users
        socket.emit('revealVotes', { storyId });
      } else {
        console.warn('[UI] Cannot reveal votes: No story selected');
      }
    };
  }
  
  revealButtonContainer.appendChild(revealBtn);

  // Create bottom row of vote cards
  const bottomVoteRow = document.createElement('div');
  bottomVoteRow.classList.add('vote-row');
  
  bottomUsers.forEach(user => {
    const voteCard = createVoteCardSpace(user, currentUserId === user.id);
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
  
  userCircleContainer.appendChild(gridLayout);
  
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
  
  // Get current story ID
  const storyId = getCurrentStoryId();
  
  // Skip for deleted stories
  if (storyId && deletedStoryIds.has(storyId)) {
    return;
  }
  
  // After updating users, also update votes
  if (storyId && votesPerStory[storyId]) {
    // Apply the votes
    const votes = votesPerStory[storyId];
    const reveal = votesRevealed[storyId];
    applyVotesToUI(votes, !reveal);
    
    // If votes were revealed, also show statistics
    if (reveal) {
      setTimeout(() => {
        handleVotesRevealed(storyId, votes);
      }, 200);
    }
  }
  
  // Request the latest votes for current story to ensure we're in sync
  if (storyId && socket && socket.connected) {
    console.log('[USERLIST] Requesting votes for current story to ensure UI is up to date');
    socket.emit('requestStoryVotes', { storyId });
  }
}

/**
 * Create avatar container for a user
 */
function createAvatarContainer(user) {
  const avatarContainer = document.createElement('div');
  avatarContainer.classList.add('avatar-container');
  avatarContainer.id = `user-circle-${user.id}`;

  avatarContainer.innerHTML = `
    <img src="${generateAvatarUrl(user.name)}" class="avatar-circle" alt="${user.name}" />
    <div class="user-name">${user.name}</div>
  `;
  
  avatarContainer.setAttribute('data-user-id', user.id);
  
  // Get current story ID
  const storyId = getCurrentStoryId();
  
  // Skip for deleted stories
  if (!storyId || deletedStoryIds.has(storyId)) {
    return avatarContainer;
  }
  
  // Check if there's an existing vote for this user in the current story
  const existingVote = votesPerStory[storyId]?.[user.id];
  if (existingVote) {
    avatarContainer.classList.add('has-voted');
  }
  
  return avatarContainer;
}

/**
 * Create vote card space for a user
 */
function createVoteCardSpace(user, isCurrentUser) {
  const voteCard = document.createElement('div');
  voteCard.classList.add('vote-card-space');
  voteCard.id = `vote-space-${user.id}`;

  if (isCurrentUser) voteCard.classList.add('own-vote-space');

  const voteBadge = document.createElement('span');
  voteBadge.classList.add('vote-badge');
  voteBadge.textContent = '';
  voteCard.appendChild(voteBadge);

  if (isCurrentUser) {
    voteCard.addEventListener('dragover', (e) => e.preventDefault());
    voteCard.addEventListener('drop', (e) => {
      e.preventDefault();
      const vote = e.dataTransfer.getData('text/plain');
      const storyId = getCurrentStoryId();
      
      // Skip for deleted stories
      if (storyId && deletedStoryIds.has(storyId)) {
        console.log(`[VOTE] Cannot cast vote for deleted story: ${storyId}`);
        return;
      }
      
      if (socket && vote && storyId) {
        socket.emit('castVote', { vote, targetUserId: user.id, storyId });
        
        // Update local state
        if (!votesPerStory[storyId]) {
          votesPerStory[storyId] = {};
        }
        
        votesPerStory[storyId][user.id] = vote;
        updateVoteVisuals(user.id, votesRevealed[storyId] ? vote : '👍', true);
      }
    });
  } else {
    voteCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      voteCard.classList.add('drop-not-allowed');
      setTimeout(() => voteCard.classList.remove('drop-not-allowed'), 300);
    });
  }

  const storyId = getCurrentStoryId();
  
  // Skip for deleted stories
  if (!storyId || deletedStoryIds.has(storyId)) {
    return voteCard;
  }
  
  const existingVote = votesPerStory[storyId]?.[user.id];
  if (existingVote) {
    voteCard.classList.add('has-vote');
    voteBadge.textContent = votesRevealed[storyId] ? existingVote : '👍';
  }

  return voteCard;
}

/**
 * Update vote visuals for a user
 */
function updateVoteVisuals(userId, vote, hasVoted = false) {
  console.log(`[DEBUG] updateVoteVisuals: userId=${userId}, vote=${vote}, hasVoted=${hasVoted}`);
  
  const storyId = getCurrentStoryId();
  
  // Skip for deleted stories or when no story is selected
  if (!storyId || deletedStoryIds.has(storyId)) {
    console.log('[VOTE] Not updating vote visuals for deleted story');
    return;
  }

  const isRevealed = votesRevealed[storyId] === true;
  const displayVote = isRevealed ? vote : '👍';

  console.log(`[DEBUG] Story ${storyId} revealed state:`, isRevealed);
  console.log(`[DEBUG] Will display: ${displayVote}`);

  // Multiple selector attempts for better reliability
  // Try direct user ID first
  let voteSpace = document.querySelector(`#vote-space-${userId}`);
  let sidebarBadge = document.querySelector(`#user-${userId} .vote-badge`);
  let avatarContainer = document.querySelector(`#user-circle-${userId}`);
  
  // If not found by socket ID, try username lookup
  if (!voteSpace || !sidebarBadge) {
    const userName = window.userMap?.[userId] || userId;
    
    // Try to find elements by username-based attributes
    const userElements = document.querySelectorAll(`.user-name`);
    userElements.forEach(el => {
      if (el.textContent === userName) {
        // Found element with matching username
        const container = el.closest('.avatar-container');
        if (container) {
          avatarContainer = container;
          const userId = container.getAttribute('data-user-id');
          if (userId) {
            voteSpace = document.querySelector(`#vote-space-${userId}`);
            sidebarBadge = document.querySelector(`#user-${userId} .vote-badge`);
          }
        }
      }
    });
  }

  // Update sidebar badge if found
  if (sidebarBadge) {
    if (hasVoted) {
      sidebarBadge.textContent = displayVote;
      sidebarBadge.style.color = '#673ab7';
      sidebarBadge.style.opacity = '1';
    } else {
      sidebarBadge.textContent = '';
    }
  } else {
    console.log(`[DEBUG] Could not find sidebar badge for ${userId}`);
  }

  // Update vote card space if found
  if (voteSpace) {
    const voteBadge = voteSpace.querySelector('.vote-badge');
    if (voteBadge) {
      if (hasVoted) {
        voteBadge.textContent = displayVote;
        voteBadge.style.color = '#673ab7';
        voteBadge.style.opacity = '1';
      } else {
        voteBadge.textContent = '';
      }
    }

    if (hasVoted) {
      voteSpace.classList.add('has-vote');
    } else {
      voteSpace.classList.remove('has-vote');
    }
  } else {
    console.log(`[DEBUG] Could not find vote space for ${userId}`);
  }

  // Update avatar styling
  if (hasVoted && avatarContainer) {
    avatarContainer.classList.add('has-voted');
    const avatar = avatarContainer.querySelector('.avatar-circle');
    if (avatar) {
      avatar.style.backgroundColor = '#c1e1c1'; // Light green
    }
  } else if (!avatarContainer) {
    console.log(`[DEBUG] Could not find avatar container for ${userId}`);
  }
}





/**
 * Update story title
 */
function updateStory(story) {
  const storyTitle = document.getElementById('currentStory');
  if (storyTitle) storyTitle.textContent = story;
}

/**
 * Setup story navigation
 */
function setupStoryNavigation() {
  const nextButton = document.getElementById('nextStory');
  const prevButton = document.getElementById('prevStory');

  if (!nextButton || !prevButton) return;
  // ✅ Disable for non-hosts
  const isHost = sessionStorage.getItem('isHost') === 'true';
  if (!isHost) {
    nextButton.disabled = true;
    prevButton.disabled = true;
    nextButton.classList.add('disabled-nav');
    prevButton.classList.add('disabled-nav');
    return;
  }
  // Prevent multiple event listeners from being added
  nextButton.replaceWith(nextButton.cloneNode(true));
  prevButton.replaceWith(prevButton.cloneNode(true));

  const newNextButton = document.getElementById('nextStory');
  const newPrevButton = document.getElementById('prevStory');

  function getOrderedCards() {
    // Get all story cards and filter out deleted ones
    const allCards = [...document.querySelectorAll('.story-card')];
    return allCards.filter(card => !deletedStoryIds.has(card.id));
  }

  function getSelectedCardIndex() {
    const cards = getOrderedCards();
    const selected = document.querySelector('.story-card.selected');
    return cards.findIndex(card => card === selected);
  }

  newNextButton.addEventListener('click', () => {
    const cards = getOrderedCards();
    if (cards.length === 0) return;

    const currentIndex = getSelectedCardIndex();
    const nextIndex = (currentIndex + 1) % cards.length;

    console.log(`[NAV] Next from ${currentIndex} → ${nextIndex}`);
    selectStory(parseInt(cards[nextIndex].dataset.index)); // emit to server
  });

  newPrevButton.addEventListener('click', () => {
    const cards = getOrderedCards();
    if (cards.length === 0) return;

    const currentIndex = getSelectedCardIndex();
    const prevIndex = (currentIndex - 1 + cards.length) % cards.length;

    console.log(`[NAV] Previous from ${currentIndex} → ${prevIndex}`);
    selectStory(parseInt(cards[prevIndex].dataset.index)); // emit to server
  });
}
/**
 * Set up story card interactions based on user role
 */
function setupStoryCardInteractions() {
  // Select all story cards
  const storyCards = document.querySelectorAll('.story-card');

  storyCards.forEach(card => {
    //Remove Touch start event

	 if(typeof(card) != undefined && typeof(card.removeEventListener )  == typeof(Function) ){

	       card.removeEventListener('touchstart',handleTouchStart )
          card.addEventListener('touchstart',handleTouchStart);

	  }

    // Check if user is a guest
    const isGuest = isGuestUser();

    if (isGuest) {
      // For guests: disable click selection and add visual indicator
      card.classList.add('disabled-story');

      // Remove all *direct* click events by cloning and replacing - but KEEP 3-dot menu
      const actionsContainer = card.querySelector('.story-actions');
      if (!actionsContainer) {
        // If card does *not* have a menu, then replace card
         const newCard = card.cloneNode(true);
           if (card.parentNode) {
                card.parentNode.replaceChild(newCard, card);
            }
       }
    } else {

      // Ensure each card has the proper 3-dot menu handler. Important on CSV load as this fixes issues
       if (isCurrentUserHost()) {
            //Only add the functions for this if its not a null action container
          const actionsContainer = card.querySelector('.story-actions');

	           if (actionsContainer && typeof( actionsContainer) != undefined) {
	              const menuBtn = actionsContainer.querySelector('.story-menu-btn');
	              const dropdown = actionsContainer.querySelector('.story-menu-dropdown');
                const editItem = dropdown.querySelector('.story-menu-item.edit');
		        const deleteItem = dropdown.querySelector('.story-menu-item.delete');

             		if(menuBtn){		 //Valid button

                                 if (!menuBtn.hasAttribute('data-listener-added')) {		//Safety check

		                                   console.log('Adding click handler to 3-dot menu (Host): ' + card.id);
                                            menuBtn.setAttribute('data-listener-added', 'true');  //Mark it not a duplicate button

                                            menuBtn.addEventListener('click', (e) => {			//This is the event for click code

	                                               e.stopPropagation();
                                                    //Close any open story-menu just before
                                                    document.querySelectorAll('.story-menu-dropdown.show').forEach(dd => {
                                                    if (dd !== dropdown) dd.classList.remove('show');
                                                });

                                                //Show the 3 dots with whatever properties are in place now after
                                                dropdown.classList.toggle('show');

                                        });		//end of menu.addeventlistener

		                           } 	//end of check  menuBtn.hasAttribute('data-listener-added')

	                  }   //end  if(menuBtn){

	                if(editItem && menuBtn){  //Make sure if both are there, then we can perform functions,Edit item listener code

                      if (!editItem.hasAttribute('data-listener-added')) {	//Safety check, prevent function dupiclates

                      editItem.setAttribute('data-listener-added', 'true');	 //Mark that one button has been created

                       editItem.addEventListener('click', (e) => { //For safe code reasons we want this inside the

                               	   if(typeof(menuBtn) != undefined && menuBtn != null){
					                     e.stopPropagation();
                                         dropdown.classList.remove('show');		 //Hide the others out if dropdown

                                          const storyId = card.id;
                                          const text = card.querySelector('.story-title').textContent;	//Get story card
 	                                     if (window.editStory && typeof window.editStory === 'function') {		//Force to the to do the edit and prevent null errors
	                                             window.editStory({ id: storyId, text: text });					 //call the code. make sure it exists
                                                 e.preventDefault();					  //Keep others away from this.

					                           console.log( "Edit " + storyId +  " Click event to select id for edit");
					                   }		 //This can only activate that this is done one time now and

					      	 }		//Menu valid
				             });   //Edit addEventListener
                    }                      //Check editItem

                  }	//  if(editItem && menuBtn){

                     if(deleteItem  &&  menuBtn){    //The delete section of the code

                           	   if (!deleteItem.hasAttribute('data-listener-added')) {	//Safety check, prevent function dupiclates

                                   deleteItem.setAttribute('data-listener-added', 'true');	 //Mark that one button has been created

                                        deleteItem.addEventListener('click', (e) => {      //Prevent running if it didn't get the first

                                                 e.stopPropagation();
                                                 dropdown.classList.remove('show');
                                                 var cardDetails =  " The delete item clicked for = " + storyId + " Card ID= " +card.className
                                                 console.log(cardDetails )	//for safe code reasons as well

			                                     let finalId = card.id;   //prevent crashes

	                                             deleteStory(finalId); //Remove the card from rendering by ID, to prevent a crash.
                                       });  //deleteItem.addEventListener	 end

                               }		 //end  if (!deleteItem.hasAttribute('data-listener-added'))

                    }	  //Last section completed

           } 		//Valid Action Continer

      }	//Is user Host, code

    }		//end Is Gust
  })	//Card for each

}		//end Function


/* function handleTouchStart(e) {
	let className ='Touched =  ' +this.className  +  ' ID name ' +  this.id;
    this.classList.add('touched'); 	     	//Add flag
    const cardTouchTimer =  setTimeout(() => {
    	if (this.className == "Touched") {
    		className += "Touch Error check values"		    	
    	}

        this.classList.remove('touched');
	  }, 200); //After touch ends after 200
	console.log("Touch feature Applied to -> " + className)
}  */

/**
 * Generate avatar URL
 */
function generateAvatarUrl(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&rounded=true`;
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
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.textContent.trim());
    });
  });
}

function triggerGlobalEmojiBurst() {
  const emojis = ['😀', '✨', '😆', '😝', '😄', '😍'];
  const container = document.body;

  for (let i = 0; i < 20; i++) {
    const burst = document.createElement('div');
    burst.className = 'global-emoji-burst';
    burst.textContent = emojis[Math.floor(Math.random() * emojis.length)];

    // Random position on screen
    burst.style.left = `${Math.random() * 100}vw`;
    burst.style.top = `${Math.random() * 100}vh`;

    container.appendChild(burst);

    // Trigger animation
    setTimeout(() => {
      burst.classList.add('burst-go');
    }, 10);

    // Remove after animation
    setTimeout(() => {
      burst.remove();
    }, 1200);
  }
}

/**
 * Handle socket messages with improved state persistence
 */
function handleSocketMessage(message) {
  const eventType = message.type;
  
  // console.log(`[SOCKET] Received ${eventType}:`, message);
  
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
        // Skip if this is a deleted story
        if (deletedStoryIds.has(message.ticketData.id)) {
          console.log('[TICKET] Ignoring deleted ticket:', message.ticketData.id);
          return;
        }
        
        console.log('[SOCKET] New ticket received:', message.ticketData);
        // Add ticket to UI without selecting it (to avoid loops)
        addTicketToUI(message.ticketData, false);
        applyGuestRestrictions();
      }
      break;
      
    case 'votingSystemUpdate':
      console.log('[DEBUG] Got voting system update:', message.votingSystem);
      sessionStorage.setItem('votingSystem', message.votingSystem);
      setupPlanningCards(); // Regenerate cards
      break;

    case 'resyncState':
      // Update local deletedStoryIds with array from server
      if (Array.isArray(message.deletedStoryIds)) {
        message.deletedStoryIds.forEach(id => {
          if (!deletedStoryIds.has(id)) {
            deletedStoryIds.add(id);
          }
        });
        
        // Save to session storage
        const roomId = getRoomIdFromURL();
        saveDeletedStoriesToStorage(roomId);
      }
      
      // Filter tickets by deleted status and process them
      const filteredTickets = (message.tickets || []).filter(ticket => 
        !deletedStoryIds.has(ticket.id)
      );
      
      processAllTickets(filteredTickets);
      
      // Update vote state
      if (message.votesPerStory) {
        for (const [storyId, votes] of Object.entries(message.votesPerStory)) {
          // Skip deleted stories
          if (deletedStoryIds.has(storyId)) continue;
          
          if (!votesPerStory[storyId]) {
            votesPerStory[storyId] = {};
          }
          
          // Merge in the votes from server
          votesPerStory[storyId] = { ...votes };
          window.currentVotesPerStory = votesPerStory;
        }
      }
      
      // Update revealed status
      if (message.votesRevealed) {
        for (const storyId in message.votesRevealed) {
          // Skip deleted stories
          if (deletedStoryIds.has(storyId)) continue;
          
          votesRevealed[storyId] = message.votesRevealed[storyId];
          
          // If this is the current story and votes are revealed, update UI
          const currentId = getCurrentStoryId();
          if (votesRevealed[storyId] && storyId === currentId) {
            const storyVotes = votesPerStory[storyId] || {};
            applyVotesToUI(storyVotes, false);
            handleVotesRevealed(storyId, storyVotes);
          }
        }
      }
      
      // Also refresh the current story votes after a short delay
      const currentStoryId = getCurrentStoryId();
      if (currentStoryId && socket && socket.connected) {
        setTimeout(() => {
          socket.emit('requestStoryVotes', { storyId: currentStoryId });
        }, 300);
      }
      break;
  case 'updateTicket':
    // Handle ticket update from another user
    if (message.ticketData) {
      console.log('[SOCKET] Ticket updated by another user:', message.ticketData);
      updateTicketInUI(message.ticketData);
    }
      break;
    case 'restoreUserVote':
      if (message.storyId && message.vote) {
        // Skip for deleted stories
        if (deletedStoryIds.has(message.storyId)) {
          console.log(`[VOTE] Ignoring vote restoration for deleted story: ${message.storyId}`);
          return;
        }
        
        // Get the current user's ID
        const currentUserId = socket.id;
        
        // Update local state
        if (!votesPerStory[message.storyId]) {
          votesPerStory[message.storyId] = {};
        }
        votesPerStory[message.storyId][currentUserId] = message.vote;
        
        // Update UI if this is the current story
        const currentId = getCurrentStoryId();
        if (message.storyId === currentId) {
          updateVoteVisuals(currentUserId, votesRevealed[message.storyId] ? message.vote : '👍', true);
        }
        
        // Also explicitly broadcast this vote to ensure other users see it too
        if (socket && socket.connected) {
          socket.emit('castVote', {
            vote: message.vote,
            targetUserId: currentUserId,
            storyId: message.storyId
          });
        }
      }
      break;

    case 'allTickets':
      // Handle receiving all tickets (used when joining a room)
      if (Array.isArray(message.tickets)) {
        // Filter out any deleted tickets
        const filteredTickets = message.tickets.filter(ticket => !deletedStoryIds.has(ticket.id));
        console.log(`[SOCKET] Received ${filteredTickets.length} valid tickets (filtered from ${message.tickets.length})`);
        processAllTickets(filteredTickets);
        applyGuestRestrictions();
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
      // Skip processing for deleted story
      if (message.storyId && deletedStoryIds.has(message.storyId)) {
        console.log(`[VOTE] Ignoring vote for deleted story: ${message.storyId}`);
        return;
      }
      
      // Handle vote received
      if (message.userId && message.vote) {
        if (!votesPerStory[message.storyId]) {
          votesPerStory[message.storyId] = {};
        }
        votesPerStory[message.storyId][message.userId] = message.vote;
        
        // Update UI if this is the current story
        const currentStoryId = getCurrentStoryId();
        if (message.storyId === currentStoryId) {
          // Display either actual vote or thumbs up depending on reveal status
          updateVoteVisuals(message.userId, votesRevealed[message.storyId] ? message.vote : '👍', true);
        }
      }
      break;
      
    case 'deleteStory':
      // Handle story deletion from another user
      if (message.storyId) {
        console.log('[SOCKET] Story deletion received for ID:', message.storyId);
        
        // Track locally
        deletedStoryIds.add(message.storyId);
        
        // Save to session storage
        const roomId = getRoomIdFromURL();
        saveDeletedStoriesToStorage(roomId);
        
        // Get the story element
        const storyCard = document.getElementById(message.storyId);
        if (storyCard) {
          // Get the index for potential reselection
          const index = parseInt(storyCard.dataset.index);
          
          console.log(`[SOCKET] Removing story card ${message.storyId} from DOM`);
          // Remove the story
          storyCard.remove();
          
          // Renumber remaining stories
          normalizeStoryIndexes();
          
          // If this was the current story, select another one
          if (index === currentStoryIndex) {
            const storyList = document.getElementById('storyList');
            if (storyList && storyList.children.length > 0) {
              const newIndex = Math.min(index, storyList.children.length - 1);
              selectStory(newIndex, false); // Don't emit selection to avoid loops
            }
          }
          // Update card interactions after DOM changes
          setupStoryCardInteractions();
        } else {
          console.warn(`[SOCKET] Could not find story card ${message.storyId} to delete`);
        }
        
        // Clean up votes for this story
        if (votesPerStory[message.storyId]) {
          delete votesPerStory[message.storyId];
          console.log(`[SOCKET] Removed votes for deleted story ${message.storyId}`);
        }
        if (votesRevealed[message.storyId]) {
          delete votesRevealed[message.storyId];
        }
      }
      break;
      
    case 'votesRevealed':
      console.log('[DEBUG] Received votesRevealed event', message);
      
      // Skip processing for deleted story
      if (message.storyId && deletedStoryIds.has(message.storyId)) {
        console.log(`[VOTE] Ignoring vote reveal for deleted story: ${message.storyId}`);
        return;
      }
      
      const storyId = message.storyId;
      
      if (storyId) {
        // Check if we've already revealed this story - IMPORTANT NEW CHECK
        if (votesRevealed[storyId] === true) {
          console.log(`[VOTE] Votes already revealed for story ${storyId}, not triggering effects again`);
          return; // Skip the rest to avoid duplicate animations
        }
        
        // Store the revealed state
        votesRevealed[storyId] = true;
        console.log(`[DEBUG] Set votesRevealed[${storyId}] = true`);
        
        // Get the votes for this story
        const votes = votesPerStory[storyId] || {};
        console.log(`[DEBUG] Votes for story ${storyId}:`, JSON.stringify(votes));
        
        // This is where we display the actual vote values
        applyVotesToUI(votes, false);
        
        // Hide planning cards for this story
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.add('hidden-until-init');
          planningCardsSection.style.display = 'none';
        }
        
        // Show statistics  
        handleVotesRevealed(storyId, votes);
        
        // Trigger emoji burst for fun effect - ONLY ONCE
        triggerGlobalEmojiBurst();
        
        // Log action for debugging
        console.log(`[VOTE] Votes revealed for story: ${storyId}, stats should now be visible`);
      }
      break;
      
    case 'votesReset':
      // Skip processing for deleted story
      if (message.storyId && deletedStoryIds.has(message.storyId)) {
        console.log(`[VOTE] Ignoring vote reset for deleted story: ${message.storyId}`);
        return;
      }
      
      // Handle votes reset
      if (message.storyId) {
        // Clear votes for the specified story
        if (votesPerStory[message.storyId]) {
          votesPerStory[message.storyId] = {};
        }
        
        // Reset revealed status
        votesRevealed[message.storyId] = false;
        
        // Always show planning cards and hide stats for this story
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.remove('hidden-until-init');
          planningCardsSection.style.display = 'block';
        }
        
        // Hide all stats containers that match this story ID
        const statsContainers = document.querySelectorAll(`.vote-statistics-container[data-story-id="${message.storyId}"]`);
        statsContainers.forEach(container => {
          container.style.display = 'none';
        });
        
        // Update UI if this is the current story
        const currentId = getCurrentStoryId();
        if (message.storyId === currentId) {
          resetAllVoteVisuals();
        }
        
        // Log reset action for debugging
        console.log(`[VOTE] Votes reset for story: ${message.storyId}, planning cards should now be visible`);
      }
      break;
      
    case 'storySelected':
      if (typeof message.storyIndex === 'number') {
        console.log('[SOCKET] Story selected from server:', message.storyIndex);
        
        // Pass the forceSelection parameter if it exists
        const forceSelection = message.forceSelection === true;
        
        // Select the story without re-emitting
        selectStory(message.storyIndex, false, forceSelection);
        
        // For guests, ensure planning cards are visible when changing stories
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.remove('hidden-until-init');
          planningCardsSection.style.display = 'block';
        }
        
        // Hide all vote statistics containers when changing stories
        const allStatsContainers = document.querySelectorAll('.vote-statistics-container');
        allStatsContainers.forEach(container => {
          container.style.display = 'none';
        });
        
        // After story selection, request votes and check if they're already revealed
        const currentStoryId = getCurrentStoryId();
        if (currentStoryId && socket && socket.connected && !deletedStoryIds.has(currentStoryId)) {
          setTimeout(() => {
            socket.emit('requestStoryVotes', { storyId: currentStoryId });
            
            // If votes are already revealed for this story, show them
            if (votesRevealed[currentStoryId] && votesPerStory[currentStoryId]) {
              setTimeout(() => {
                handleVotesRevealed(currentStoryId, votesPerStory[currentStoryId]);
              }, 200);
            }
          }, 100);
        }
      }
      break;
      
    case 'storyVotes':
      // Skip processing for deleted story
      if (message.storyId && deletedStoryIds.has(message.storyId)) {
        console.log(`[VOTE] Ignoring votes for deleted story: ${message.storyId}`);
        return;
      }
      
      // Handle received votes for a specific story with improved state persistence
      if (message.storyId !== undefined && message.votes) {
        // Store votes for this story
        if (!votesPerStory[message.storyId]) {
          votesPerStory[message.storyId] = {};
        }
        
        // Update with received votes
        Object.assign(votesPerStory[message.storyId], message.votes);
        
        // Update UI if this is the current story
        const currentId = getCurrentStoryId();
        if (message.storyId === currentId) {
          // If votes are revealed, show them; otherwise, just show that people voted
          if (votesRevealed[message.storyId]) {
            applyVotesToUI(message.votes, false);
            handleVotesRevealed(message.storyId, votesPerStory[message.storyId]);
          } else {
            applyVotesToUI(message.votes, true);
          }
        }
      }
      break;
      
    case 'syncCSVData':
      // Handle CSV data sync with improved state handling
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
            // Skip if this is a deleted story
            if (deletedStoryIds.has(card.id)) {
              return;
            }
            
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
        
        // We don't need to re-add manual tickets because displayCSVData now preserves them
        
        // Update UI
        renderCurrentStory();
      }
      break;

    case 'connect':
      // When connection is established
      updateConnectionStatus('connected');
      
      // Request tickets and state after connection
      setTimeout(() => {
        if (socket && socket.connected) {
          if (!hasRequestedTickets) {
            console.log('[SOCKET] Connected, requesting all tickets');
            socket.emit('requestAllTickets');
            hasRequestedTickets = true;
          }
          
          // Also request votes for current story
          const currentId = getCurrentStoryId();
          if (currentId && !deletedStoryIds.has(currentId)) {
            socket.emit('requestStoryVotes', { storyId: currentId });
          }
        }
      }, 500);
      break;
      
    case 'reconnect_attempt':
      // Show reconnecting status
      updateConnectionStatus('reconnecting');
      reconnectingInProgress = true;
      break;
      
    case 'reconnect':
      // Handle successful reconnection
      updateConnectionStatus('connected');
      reconnectingInProgress = false;
      
      // Request current state after reconnection
      setTimeout(() => {
        if (socket && socket.connected) {
          // Request votes for current story
          const currentId = getCurrentStoryId();
          if (currentId && !deletedStoryIds.has(currentId)) {
            socket.emit('requestStoryVotes', { storyId: currentId });
          }
          
          // Request all tickets if we don't have them
          if (!hasRequestedTickets) {
            socket.emit('requestAllTickets');
            hasRequestedTickets = true;
          }
          
          // Request a full state resync to ensure we have the latest state
          socket.emit('requestFullStateResync');
        }
      }, 500);
      break;
      
    case 'error':
      // Show connection error status
      updateConnectionStatus('error');
      break;
      
    // Handle heartbeat responses
    case 'heartbeatResponse':
      console.log('[SOCKET] Received heartbeat response from server');
      break;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  let roomId = getRoomIdFromURL();
  if (!roomId) {
    roomId = 'room-' + Math.floor(Math.random() * 10000);
  }
  appendRoomIdToURL(roomId);
  
  // Load deleted stories from storage first
  loadDeletedStoriesFromStorage(roomId);
  
  initializeApp(roomId);
});

// Apply CSS to hide elements until initialized
const styleExtra = document.createElement('style');
styleExtra.textContent = `.hidden-until-init { display: none !important; }`;
document.head.appendChild(styleExtra);

// Clear heartbeat interval when page is unloaded
window.addEventListener('beforeunload', () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
});
