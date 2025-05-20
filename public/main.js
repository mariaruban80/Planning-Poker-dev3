// Get username from sessionStorage (already set from main.html or by index.html prompt)
let userName = sessionStorage.getItem('userName');
let processingCSVData = false;
// Add this to fix roomId issue
let roomId = new URLSearchParams(window.location.search).get('roomId') || '';
// Import socket functionality
import { initializeWebSocket, emitCSVData, requestStoryVotes, emitAddTicket, emitVote } from './socket.js'; 

// Flag to track if username is ready for socket initialization
window.userNameReady = !!userName;

// Add a window function for index.html to call when joining via invite
window.initializeSocketWithName = function(roomId, name) {
  if (!roomId || !name) return;
  
  console.log(`[APP] Initializing socket with name: ${name} for room: ${roomId}`);
  
  // Set username in the module scope
  userName = name;
  
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
  
  // Add CSS for new layout
  addNewLayoutStyles();
};

// Flag to track manually added tickets that need to be preserved
let preservedManualTickets = [];

//Save app state on page visibility change or before unload
document.addEventListener('visibilitychange', saveAppState);
window.addEventListener('beforeunload', saveAppState);

// Keep track of last activity time
let lastActivityTime = Date.now();
const activityTimeout = 5 * 60 * 1000; // 5 minutes

// Update activity timestamp on user interaction
document.addEventListener('click', updateActivityTimestamp);
document.addEventListener('keypress', updateActivityTimestamp);
document.addEventListener('touchstart', updateActivityTimestamp);

// Check activity periodically
setInterval(checkActivity, 60000); // Check every minute

/**
 * Save current app state to sessionStorage
 */
function saveAppState() {
  const currentState = {
    votingSystem: sessionStorage.getItem('votingSystem') || 'fibonacci',
    currentStoryIndex: currentStoryIndex,
    userName: userName,
    roomId: roomId, // This now uses the global variable defined at the top
    isHost: sessionStorage.getItem('isHost')
  };
  
  sessionStorage.setItem('appState', JSON.stringify(currentState));
}

function createStoryCard(story, index, isCSV = false) {
  const card = document.createElement('div');
  card.className = 'story-card';
  card.dataset.index = index;
  card.id = isCSV ? `story_csv_${index}` : story.id;

  const title = document.createElement('div');
  title.className = 'story-title';
  title.textContent = story.text || story.title || `Story ${index + 1}`;
  card.appendChild(title);

  // Add delete button for all cards
  const removeBtn = document.createElement('span');
  removeBtn.className = 'remove-story';
  removeBtn.innerHTML = '&times;';
  removeBtn.title = 'Remove story';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this story?')) {
      removeStory(card.id);
    }
  });
  card.appendChild(removeBtn);

  return card;
}

/** to reset votes when the stories are deleted */
function resetAllVotingVisuals() {
  console.log('[UI] FORCE RESET: clearing badges, avatars, stats');

  // Force remove all vote badges from anywhere in DOM
  const allBadges = document.querySelectorAll('.vote-badge');
  allBadges.forEach(badge => {
    badge.remove();
  });

  // Remove has-vote from vote card spaces
  document.querySelectorAll('.vote-card-space').forEach(space => {
    space.classList.remove('has-vote');
  });

  // Remove has-voted from all avatars
  document.querySelectorAll('.avatar-container').forEach(avatar => {
    avatar.classList.remove('has-voted');
  });

  // Hide planning cards and stats
  const planningCardsSection = document.querySelector('.planning-cards-section');
  if (planningCardsSection) planningCardsSection.style.display = 'none';

  const statsContainer = document.querySelector('.vote-statistics-container');
  if (statsContainer) {
    statsContainer.style.display = 'none';
    statsContainer.innerHTML = '';
  }

  // Disable drag
  document.querySelectorAll('#planningCards .card').forEach(card => {
    card.classList.add('disabled');
    card.setAttribute('draggable', 'false');
  });

  // Show no stories message
  const noStoriesMessage = document.getElementById('noStoriesMessage');
  if (noStoriesMessage) {
    noStoriesMessage.style.display = 'block';
  }
}


/**
 * Update last activity timestamp
 */
function updateActivityTimestamp() {
  lastActivityTime = Date.now();
}

/**
 * Check if user has been inactive and refresh connection if needed
 */
function checkActivity() {
  const now = Date.now();
  const timeSinceActivity = now - lastActivityTime;
  
  if (timeSinceActivity > activityTimeout) {
    console.log('[APP] User inactive for more than 5 minutes, refreshing connection');
    
    // Save current state
    saveAppState();
    
    // Reconnect socket
    if (typeof reconnect === 'function') {
      reconnect();
    } else if (socket) {
      socket.disconnect().connect();
    }
    
    // Reset activity timestamp
    updateActivityTimestamp();
  }
}

// Add recovery function to handle reconnection
function recoverAppState() {
  try {
    const savedState = sessionStorage.getItem('appState');
    if (savedState) {
      const state = JSON.parse(savedState);
      
      // Restore voting system
      if (state.votingSystem) {
        sessionStorage.setItem('votingSystem', state.votingSystem);
        setupPlanningCards(); // Regenerate cards with saved system
      }
      
      // Restore story selection if possible
    if (typeof state.currentStoryIndex === 'number' && 
          document.querySelectorAll('.story-card').length > state.currentStoryIndex) {
          setTimeout(() => {
          selectStory(state.currentStoryIndex, false);
          receivedInitialStoryIndex = true; // ✅ Prevent overriding later
        }, 500);
      }
    }
  } catch (err) {
    console.error('[APP] Error recovering app state:', err);
  }
}


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
let userVotes = {};
let socket = null;
let csvDataLoaded = false;
let votesPerStory = {};     // Track votes for each story { storyIndex: { userId: vote, ... }, ... }
let votesRevealed = {};     // Track which stories have revealed votes { storyIndex: boolean }
let manuallyAddedTickets = []; // Track tickets added manually
let hasRequestedTickets = false; // Flag to track if we've already requested tickets
let receivedInitialStoryIndex = false; // NEW: track if server sent storySelected


// Adding  this function to main.js to be called whenever votes are revealed
function fixRevealedVoteFontSizes() {
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
    //  box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
      max-width: 300px;
      margin: 20px auto;
      padding: 20px;
      display: flex;
      align-items: flex-start;
    }

    .story-delete-btn {
    float: right;
    cursor: pointer;
    margin-left: 10px;
    color: #d32f2f;
    font-size: 14px;
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
    .remove-story {
      cursor: pointer;
      position: absolute;
      top: 5px;
      right: 5px;
      font-size: 18px;
      z-index: 10;
    }
    
    .fixed-agreement-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: white;
    }
    .story-card {
      position: relative; /* Ensure position relative for absolute positioning of delete button */
    }
    
    /* Make delete button more visible on hover */
    .remove-story:hover {
      color: #f44336;
      transform: scale(1.1);
    }
  `;
  
  document.head.appendChild(style);
}

function createFixedVoteDisplay(votes) {
  const container = document.createElement('div');
  container.className = 'fixed-vote-display';

  const voteValues = Object.values(votes);
  const numericValues = voteValues
    .filter(v => !isNaN(parseFloat(v)) && v !== null && v !== undefined)
    .map(v => parseFloat(v));

  const voteCount = voteValues.length;
  let averageValue = 0;

 const voteFrequency = {};
let highestCount = 0;

// Count votes and track highest frequency
voteValues.forEach(vote => {
  voteFrequency[vote] = (voteFrequency[vote] || 0) + 1;
  if (voteFrequency[vote] > highestCount) {
    highestCount = voteFrequency[vote];
  }
});

// Find how many votes have the highest count
const majorityVotes = Object.entries(voteFrequency)
  .filter(([_, count]) => count === highestCount)
  .map(([vote]) => vote);

const isTie = majorityVotes.length > 1;
const mostCommonVote = !isTie ? majorityVotes[0] : '—';

  // Calculate average
  if (numericValues.length > 0) {
    averageValue = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    averageValue = Math.round(averageValue * 10) / 10;
  }

  // Create updated HTML
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
          <div class="agreement-icon">${isTie ? '⚠️' : '👍'}</div>
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
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('roomId') && (!urlParams.has('host') || urlParams.get('host') !== 'true');
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
  // Check if we're waiting for a username (joining via invite)
  if (window.userNameReady === false) {
    console.log('[APP] Waiting for username before initializing socket');
    return; // Exit early, we'll initialize after username is provided
  }

  // Initialize socket with userName from sessionStorage
  socket = initializeWebSocket(roomId, userName, handleSocketMessage);
  
  // Only continue if socket initialization was successful
  if (!socket) {
    console.error('[APP] Failed to initialize socket - missing username or room ID');
    return;
  }
  
//  Guest: Listen for host's voting system
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

  
  // removed this function addVoteStatisticsStyles();
 updateHeaderStyle();
    addFixedVoteStatisticsStyles();
  setupCSVUploader();
  setupInviteButton();
  setupStoryNavigation();
//  setupVoteCardsDrag();
  setupPlanningCards(); // generates the cards AND sets up drag listeners

  setupRevealResetButtons();
  setupAddTicketButton();
  setupGuestModeRestrictions(); // Add guest mode restrictions
   // Add this line
  setupStoryCardInteractions();
  // Add CSS for new layout
  addNewLayoutStyles();
}
function isCurrentUserHost() {
  return sessionStorage.getItem('isHost') === 'true';
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
own-vote-space {
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
  `;
  document.head.appendChild(style);
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
function addVoteStatisticsStyles() 
{
    // Remove any existing vote statistics styles first to avoid duplication
  const existingStyle = document.getElementById('vote-statistics-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  const style = document.createElement('style');
  style.textContent = `
    .vote-statistics-display {
      display: flex;
      background-color: white;
      border-radius: 8px;
      border: white;
      padding: 20px;
      margin: 20px auto;
      max-width: 350px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      align-items: center;
      justify-content: center;
    }
    
    .vote-chart {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-right: 30px;
    }
    
    .vote-card-box {
      width: 60px;
      height: 90px;
      border: 2px solid #000;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: white;
      font-weight: bold;
    }
    
    .vote-value {
      font-size: 28px;
      font-weight: bold;
    }
    
    .vote-count {
      margin-top: 10px;
      font-size: 14px;
      color: #555;
    }
    
    .vote-stats {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .stat-row {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    
    .stat-label {
      font-size: 16px;
      color: #333;
      margin-bottom: 5px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #111;
    }
    
    .stat-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 18px;
    }
    
    .agreement-icon {
      font-size: 20px;
      color: white;
    }
  `;
  document.head.appendChild(style);
}
/**
 * Handle votes revealed event by showing statistics
 * @param {number} storyIndex - Index of the story
 * @param {Object} votes - Vote data
 */
function handleVotesRevealed(storyId, votes) {
  // Mark this story as having revealed votes using storyId
  votesRevealed[storyId] = true;

  // Get the planning cards container
  const planningCardsSection = document.querySelector('.planning-cards-section');
  
  // Add fixed styles
  addFixedVoteStatisticsStyles();

  // Create vote statistics display
  const voteStats = createFixedVoteDisplay(votes);

  // Display vote statistics
  if (planningCardsSection) {
    let statsContainer = document.querySelector('.vote-statistics-container');
    if (!statsContainer) {
      statsContainer = document.createElement('div');
      statsContainer.className = 'vote-statistics-container';
      planningCardsSection.parentNode.insertBefore(statsContainer, planningCardsSection.nextSibling);
    }

    statsContainer.innerHTML = '';
    statsContainer.appendChild(voteStats);
    planningCardsSection.style.display = 'none';
    statsContainer.style.display = 'block';
  }

  // Apply vote visuals
  applyVotesToUI(votes, false);

  setTimeout(fixRevealedVoteFontSizes, 100);
  setTimeout(fixRevealedVoteFontSizes, 300);
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
  storyCard.appendChild(storyTitle);

  // Add delete button for all cards if not guest user
  if (!isGuestUser()) {
    const removeBtn = document.createElement('span');
    removeBtn.className = 'remove-story';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove this story';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to remove this story?')) {
        removeStory(ticketData.id);
      }
    });
    storyCard.appendChild(removeBtn);
  }

  // Add click handler directly without cloning
  if (!isGuestUser()) {
    storyCard.addEventListener('click', () => {
      selectStory(newIndex);
    });
  } else {
    storyCard.classList.add('disabled-story');
  }

  // Add to DOM
  storyList.appendChild(storyCard);

  // Auto-select if requested
  if (selectAfterAdd && !isGuestUser()) {
    selectStory(newIndex);
  }

  // Hide "no stories" message
  const noStoriesMessage = document.getElementById('noStoriesMessage');
  if (noStoriesMessage) {
    noStoriesMessage.style.display = 'none';
  }

  // Enable planning cards
  document.querySelectorAll('#planningCards .card').forEach(card => {
    card.classList.remove('disabled');
    card.setAttribute('draggable', 'true');
  });

  normalizeStoryIndexes();
  return storyCard;
}



/** function to remove selected story  */
function removeStory(storyId) {
  const card = document.getElementById(storyId);
  if (card) {
    card.remove();
  }

  if (!isGuestUser() && socket) {
    console.log('[CLIENT] Emitting removeTicket for:', storyId);
    socket.emit('removeTicket', { storyId });
  }

  normalizeStoryIndexes();

  const selected = document.querySelector('.story-card.selected');
  if (!selected) {
    const first = document.querySelector('.story-card');
    if (first) {
      const index = parseInt(first.dataset.index, 10);
      selectStory(index);
    }
  }
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
    
    // Remove all click events by cloning and replacing
    const newCard = card.cloneNode(true);
    if (card.parentNode) {
      card.parentNode.replaceChild(newCard, card);
    }
  });
}

/**
 * Process multiple tickets at once (used when receiving all tickets from server)
 * @param {Array} tickets - Array of ticket data objects
 */
function processAllTickets(tickets) {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    console.log('[INFO] No tickets received from server');
    return;
  }
  
  console.log('[INFO] Processing all tickets received from server:', tickets.length);
  
  // Clear all existing stories to avoid duplicates
  const storyList = document.getElementById('storyList');
  if (storyList) {
    // Clear all stories to prevent duplicates
    storyList.innerHTML = '';
  }
  
  // Track processed ticket IDs to avoid duplicates
  const processedIds = new Set();
  
  // Add all tickets to the UI
  tickets.forEach((ticket, index) => {
    // Only add if it has required properties and hasn't been processed already
    if (ticket && ticket.id && ticket.text && !processedIds.has(ticket.id)) {
      console.log(`[INFO] Adding ticket #${index}:`, ticket.id);
      addTicketToUI(ticket, false);
      processedIds.add(ticket.id);
    } else if (processedIds.has(ticket.id)) {
      console.log(`[INFO] Skipping duplicate ticket:`, ticket.id);
    }
  });
  
  // Select first story if any
  if (tickets.length > 0 && !receivedInitialStoryIndex) {
    currentStoryIndex = 0;
    selectStory(0, false); // Select only if server hasn't already sent a selection
  } else {
    console.log('[INFO] Skipping auto-select of story 0 — server already selected:', currentStoryIndex);
  }

  
  // ✅ Fix indexes to ensure navigation works
  normalizeStoryIndexes();
  
  // Set up interactions for the newly added story cards
  setupStoryCardInteractions();
  
  // If a story index was selected before, try to reapply it
  if (pendingStoryIndex !== null) {
    const cards = document.querySelectorAll('.story-card');
    if (cards.length > pendingStoryIndex) {
      console.log('[INFO] Reapplying pending story selection:', pendingStoryIndex);
      selectStory(pendingStoryIndex, false);
    }
    pendingStoryIndex = null;
  }
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
      const storyList = document.getElementById('storyList');
      const existingTickets = [];

      if (storyList) {
        const manualTickets = storyList.querySelectorAll('.story-card[id^="story_"]:not([id^="story_csv_"])');
        manualTickets.forEach(card => {
          const title = card.querySelector('.story-title');
          if (title) {
            existingTickets.push({ id: card.id, text: title.textContent });
          }
        });
      }

      console.log(`[CSV] Saved ${existingTickets.length} manual tickets before processing upload`);

      const parsedData = parseCSV(e.target.result);
      csvData = parsedData;
      displayCSVData(csvData);

      // Note: We're now emitting each ticket in displayCSVData instead of the whole CSV data at once
      // This is the key change to make CSV uploads synchronize properly

      existingTickets.forEach((ticket, index) => {
        if (ticket && ticket.id && ticket.text) {
          addTicketToUI(ticket, false);
        }
      });

      normalizeStoryIndexes();
      
      // Clear the input so the same file can be uploaded again if needed
      csvInput.value = '';
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
    existingStories.forEach(story => {
      addTicketToUI(story, false);
    });
    
    // Then add CSV data - using addTicketToUI for each row to leverage its delete button creation
    data.forEach((row, index) => {
      const ticketData = {
        id: `story_csv_${index}`,
        text: Array.isArray(row) ? row.join(' | ') : String(row)
      };

      // IMPORTANT: Emit each CSV row as an individual ticket to the server
      if (typeof emitAddTicket === 'function') {
        console.log('[CSV] Emitting ticket to server:', ticketData);
        emitAddTicket(ticketData);
      } else if (socket) {
        console.log('[CSV] Emitting ticket via socket:', ticketData);
        socket.emit('addTicket', ticketData);
      }

      // Add to UI without selecting (we'll handle selection after all are added)
      addTicketToUI(ticketData, false);
    });
    
    // Update preserved tickets list
    preservedManualTickets = existingStories;
    
    console.log(`[CSV] Display complete: ${existingStories.length} manual + ${data.length} CSV = ${storyListContainer.children.length} total`);
    
    // Check if there are any stories and show/hide message accordingly
    const noStoriesMessage = document.getElementById('noStoriesMessage');
    if (noStoriesMessage) {
      noStoriesMessage.style.display = storyListContainer.children.length === 0 ? 'block' : 'none';
    }
    
    // Enable/disable planning cards based on story availability
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
    
    // Select first story if none is selected
    const selectedStory = storyListContainer.querySelector('.story-card.selected');
    if (!selectedStory && storyListContainer.children.length > 0) {
      selectStory(0, true);
    }
  } finally {
    normalizeStoryIndexes();
    setupStoryCardInteractions();
    // Always release the processing flag
    processingCSVData = false;
  }
}

/**
 * Select a story by index
 * @param {number} index - Story index to select
 * @param {boolean} emitToServer - Whether to emit to server (default: true)
 */
function selectStory(index, emitToServer = true) {
  console.log('[UI] Story selected by user:', index);

  // Update story card highlight
  document.querySelectorAll('.story-card').forEach(card => {
    card.classList.remove('selected', 'active');
  });

  const storyCard = document.querySelector(`.story-card[data-index="${index}"]`);
  if (storyCard) {
    storyCard.classList.add('selected', 'active');
  }

  // Update state
  currentStoryIndex = index;

  // Ensure reveal state is initialized
  if (typeof votesRevealed[index] === 'undefined') {
    votesRevealed[index] = false;
  }

  // Show planning cards or stats depending on reveal state
  const planningCardsSection = document.querySelector('.planning-cards-section');
  const statsContainer = document.querySelector('.vote-statistics-container');

  if (votesRevealed[index]) {
    handleVotesRevealed(index, votesPerStory[index] || {});
  } else {
    if (planningCardsSection) planningCardsSection.style.display = 'block';
    if (statsContainer) statsContainer.style.display = 'none';
  }

  renderCurrentStory();
  resetOrRestoreVotes(index);

  // ✅ Always request votes, even if we're not emitting selection
  if (typeof requestStoryVotes === 'function') {
    requestStoryVotes(index);
  } else if (socket) {
    socket.emit('requestStoryVotes', { storyIndex: index });
  }

  // Only emit selection event if requested
  if (emitToServer && socket) {
    console.log('[EMIT] Broadcasting story selection:', index);
    socket.emit('storySelected', { storyIndex: index });
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
  updateVoteVisuals(userId, hideValues ? '👍' : vote, true);
 //     updateVoteVisuals(userId, vote, true);
  //  showEmojiBurst(userId, vote);
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


function sanitizeId(name) {
  return name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
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

  const currentUserName = sessionStorage.getItem('userName');

  // Build user list in sidebar
  users.forEach(user => {
    const safeId = sanitizeId(user.name);
    const userEntry = document.createElement('div');
    userEntry.id = `user-${safeId}`;
    userEntry.classList.add('user-entry');
    userEntry.innerHTML = `
      <img src="${generateAvatarUrl(user.name)}" class="avatar" alt="${user.name}">
      <span class="username">${user.name}</span>
      <span class="vote-badge"></span>
    `;
    userListContainer.appendChild(userEntry);
  });

  // Split users into top/bottom layout
  const halfPoint = Math.ceil(users.length / 2);
  const topUsers = users.slice(0, halfPoint);
  const bottomUsers = users.slice(halfPoint);

  const topAvatarRow = document.createElement('div');
  topAvatarRow.classList.add('avatar-row');

  topUsers.forEach(user => {
    const avatarContainer = createAvatarContainer(user);
    topAvatarRow.appendChild(avatarContainer);
  });

  const topVoteRow = document.createElement('div');
  topVoteRow.classList.add('vote-row');

  topUsers.forEach(user => {
    const isCurrentUser = user.name === currentUserName;
    const voteCard = createVoteCardSpace(user, isCurrentUser);
    topVoteRow.appendChild(voteCard);
  });

  const revealButtonContainer = document.createElement('div');
  revealButtonContainer.classList.add('reveal-button-container');

  const revealBtn = document.createElement('button');
  revealBtn.textContent = 'REVEAL VOTES';
  revealBtn.classList.add('reveal-votes-button');

  if (isGuestUser()) {
    revealBtn.classList.add('hide-for-guests');
  } else {
    revealBtn.onclick = () => {
      if (socket) {
        socket.emit('revealVotes');
        votesRevealed[currentStoryIndex] = true;

        if (votesPerStory[currentStoryIndex]) {
          applyVotesToUI(votesPerStory[currentStoryIndex], false);
        }
      }
    };
  }

  revealButtonContainer.appendChild(revealBtn);

  const bottomVoteRow = document.createElement('div');
  bottomVoteRow.classList.add('vote-row');

  bottomUsers.forEach(user => {
    const isCurrentUser = user.name === currentUserName;
    const voteCard = createVoteCardSpace(user, isCurrentUser);
    bottomVoteRow.appendChild(voteCard);
  });

  const bottomAvatarRow = document.createElement('div');
  bottomAvatarRow.classList.add('avatar-row');

  bottomUsers.forEach(user => {
    const avatarContainer = createAvatarContainer(user);
    bottomAvatarRow.appendChild(avatarContainer);
  });

  const gridLayout = document.createElement('div');
  gridLayout.classList.add('poker-table-layout');
  gridLayout.appendChild(topAvatarRow);
  gridLayout.appendChild(topVoteRow);
  gridLayout.appendChild(revealButtonContainer);
  gridLayout.appendChild(bottomVoteRow);
  gridLayout.appendChild(bottomAvatarRow);

  userCircleContainer.appendChild(gridLayout);

  // Optional: request tickets after list builds
  if (!hasRequestedTickets && users.length > 0) {
    setTimeout(() => {
      if (socket && socket.connected) {
        console.log('[INFO] Requesting all tickets after user list update');
        socket.emit('requestAllTickets');
        hasRequestedTickets = true;
      }
    }, 500);
  }
}


/**
 * Create avatar container for a user
 */
function createAvatarContainer(user) {
  const safeId = sanitizeId(user.name); // ✅ define safeId
  const userName = user.name;

  const avatarContainer = document.createElement('div');
  avatarContainer.classList.add('avatar-container');
  avatarContainer.id = `user-circle-${safeId}`; // ✅ safe, consistent DOM ID

  avatarContainer.innerHTML = `
    <img src="${generateAvatarUrl(userName)}" class="avatar-circle" alt="${userName}" />
    <div class="user-name">${userName}</div>
  `;

  // You can keep this for analytics, debugging, or targeting
  avatarContainer.setAttribute('data-user-id', userName);

  // Check if there's an existing vote for this user in the current story
  const existingVote = votesPerStory[currentStoryIndex]?.[userName];
  if (existingVote) {
    avatarContainer.classList.add('has-voted');
  }

  return avatarContainer;
}


/**
 * Create vote card space for a user
 */
function createVoteCardSpace(user, isCurrentUser) {
  const safeId = sanitizeId(user.name);
  const userName = user.name;

  const voteCard = document.createElement('div');
  voteCard.classList.add('vote-card-space');
  voteCard.id = `vote-space-${safeId}`;

  // Visual indicator for the current user
  if (isCurrentUser) {
    voteCard.classList.add('own-vote-space');
  }

  // Add vote badge
  const voteBadge = document.createElement('span');
  voteBadge.classList.add('vote-badge');
  voteBadge.textContent = '';
  voteCard.appendChild(voteBadge);

  // Only allow vote drops for the current user
  if (isCurrentUser) {
    voteCard.addEventListener('dragover', (e) => e.preventDefault());

    voteCard.addEventListener('drop', (e) => {
      e.preventDefault();
      const vote = e.dataTransfer.getData('text/plain');

      if (socket && vote) {
        socket.emit('castVote', { vote, targetUserId: userName });
      }

      // Store vote locally
      if (!votesPerStory[currentStoryIndex]) {
        votesPerStory[currentStoryIndex] = {};
      }
      votesPerStory[currentStoryIndex][userName] = vote;

      // Update UI immediately
      updateVoteVisuals(userName, votesRevealed[currentStoryIndex] ? vote : '👍', true);
    });
  } else {
    // Disallow drop on other users' cards
    voteCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      voteCard.classList.add('drop-not-allowed');
      setTimeout(() => voteCard.classList.remove('drop-not-allowed'), 300);
    });
  }
  // Pre-fill existing vote if it exists
  const existingVote = votesPerStory[currentStoryIndex]?.[userName];
  if (existingVote) {
    voteCard.classList.add('has-vote');
    voteBadge.textContent = votesRevealed[currentStoryIndex] ? existingVote : '👍';
  }

  return voteCard;
}


/**
 * Update vote visuals for a user
 */
function updateVoteVisuals(userId, vote, hasVoted = false) {
  const safeId = sanitizeId(userId);
  // Determine what to show based on reveal state
  const displayVote = votesRevealed[currentStoryIndex] ? vote : '👍';
  
  // Update badges in sidebar
  const sidebarBadge = document.querySelector(`#user-${safeId} .vote-badge`);
  if (sidebarBadge) {
    // Only set content if the user has voted
    if (hasVoted) {
      sidebarBadge.textContent = displayVote;
      sidebarBadge.style.color = '#673ab7'; // Make sure the text has a visible color
      sidebarBadge.style.opacity = '1'; // Ensure full opacity
    } else {
      sidebarBadge.textContent = ''; // Empty if no vote
    }
  }
  
  // Update vote card space
  const voteSpace = document.querySelector(`#vote-space-${safeId}`);
  if (voteSpace) {
    const voteBadge = voteSpace.querySelector('.vote-badge');
    if (voteBadge) {
      // Only show vote if they've voted
      if (hasVoted) {
        voteBadge.textContent = displayVote;
        voteBadge.style.color = '#673ab7'; // Make sure the text has a visible color
        voteBadge.style.opacity = '1'; // Ensure full opacity
      } else {
        voteBadge.textContent = ''; // Empty if no vote
      }
    }
    
    // Update vote space class
    if (hasVoted) {
      voteSpace.classList.add('has-vote');
    } else {
      voteSpace.classList.remove('has-vote');
    }
  }

  // Update avatar to show they've voted
  if (hasVoted) {
    const avatarContainer = document.querySelector(`#user-circle-${safeId}`);
    if (avatarContainer) {
      avatarContainer.classList.add('has-voted');
      
      const avatar = avatarContainer.querySelector('.avatar-circle');
      if (avatar) {
        avatar.style.backgroundColor = '#c1e1c1'; // Green background
      }
    }
    
    // Also update sidebar avatar
    const sidebarAvatar = document.querySelector(`#user-${safeId} img.avatar`);
    if (sidebarAvatar) {
      sidebarAvatar.style.backgroundColor = '#c1e1c1';
    }
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
    return [...document.querySelectorAll('.story-card')];
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
    selectStory(nextIndex); // emit to server
  });

  newPrevButton.addEventListener('click', () => {
    const cards = getOrderedCards();
    if (cards.length === 0) return;

    const currentIndex = getSelectedCardIndex();
    const prevIndex = (currentIndex - 1 + cards.length) % cards.length;

    console.log(`[NAV] Previous from ${currentIndex} → ${prevIndex}`);
    selectStory(prevIndex); // emit to server
  });
}

/**
 * Set up story card interactions based on user role
 */
function setupStoryCardInteractions() {
  // Check if user is a guest (joined via shared URL)
  const isGuest = isGuestUser();
  
  // Select all story cards
  const storyCards = document.querySelectorAll('.story-card');
  
  storyCards.forEach(card => {
    if (isGuest) {
      // For guests: disable clicking and add visual indicator
      card.classList.add('disabled-story');
    } else {
      // For hosts: preserve delete button if it exists
      const deleteBtn = card.querySelector('.remove-story');
      
      // Reset click events by cloning, but preserve delete button behavior
      const newCard = card.cloneNode(true);
      if (card.parentNode) {
        card.parentNode.replaceChild(newCard, card);
      }
      
      // Add fresh click event listener for story selection
      newCard.addEventListener('click', () => {
        const index = parseInt(newCard.dataset.index || 0);
        selectStory(index);
      });
      
      // Reapply delete button event if it exists
      const newDeleteBtn = newCard.querySelector('.remove-story');
      if (newDeleteBtn) {
        newDeleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (confirm('Are you sure you want to remove this story?')) {
            removeStory(newCard.id);
          }
        });
      }
    }
  });
}


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
  document.querySelectorAll('.vote-card-space').forEach(space => {
    space.addEventListener('dragover', (e) => {
      e.preventDefault(); // Allow drop
    });

    space.addEventListener('drop', (e) => {
      e.preventDefault();
      const vote = e.dataTransfer.getData('text/plain');
      const userName = sessionStorage.getItem('userName');
      if (userName) {
        emitVote(vote, userName); // ✅ Use userName instead of socket.id
      }
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
 * Handle socket messages
 */
function handleSocketMessage(message) {
  const eventType = message.type;
  const isHost = sessionStorage.getItem('isHost') === 'true';

  
  // console.log(`[SOCKET] Received ${eventType}:`, message);
  
  switch(eventType) {
    case 'userList':
      // Update the user list when server sends an updated list
    if (Array.isArray(message.users)) {
    updateUserList(message.users);

    // ✅ If host, re-emit current story to sync for new users
    if (isHost && typeof emitStorySelected === 'function') {
      const currentIndex = getCurrentStoryIndex?.() ?? 0;
      console.log('[HOST] Re-emitting current story index for guests:', currentIndex);
      emitStorySelected(currentIndex);
    }
  }
   break;
case 'ticketRemoved':
  if (message.storyId) {
    const card = document.getElementById(message.storyId);
    if (card) {
      card.remove();
      normalizeStoryIndexes();

      const remainingStories = document.querySelectorAll('.story-card');
      if (remainingStories.length === 0) {
        console.log('[SOCKET] All stories removed, resetting UI');

        // Reset immediately, then again after a delay
        resetAllVotingVisuals();
        setTimeout(resetAllVotingVisuals, 200); // re-clear any delayed DOM updates
        votesPerStory = {};
        votesRevealed = {};
        currentStoryIndex = 0;
      }
      // If selected story was removed, pick first
      const selected = document.querySelector('.story-card.selected');
      if (!selected && remainingStories.length > 0) {
        const index = parseInt(remainingStories[0].dataset.index, 10);
        selectStory(index);
      }
    }
  }
  break;

     case 'votingSystemUpdate':
      console.log('[DEBUG] Got voting system update:', message.votingSystem);
      sessionStorage.setItem('votingSystem', message.votingSystem);
      setupPlanningCards(); // Regenerate cards
      break;
     
    case 'userJoined':
      // Individual user joined - could update existing list
      break;
      
    case 'userLeft':
      // Handle user leaving
      break;
      
    case 'voteReceived':
    case 'connect':
    // When connection is established or reestablished, try to recover state
    recoverAppState();
    break;
    case 'voteUpdate':
      // Handle vote received
       if (message.userId && message.vote && message.storyId) {
      if (!votesPerStory[message.storyId]) {
        votesPerStory[message.storyId] = {};
      }
      votesPerStory[message.storyId][message.userId] = message.vote;
  
      // Apply to UI only if this is the currently selected story
      const selectedCard = document.querySelector('.story-card.selected');
      if (selectedCard && selectedCard.id === message.storyId) {
        updateVoteVisuals(message.userId, votesRevealed[message.storyId] ? message.vote : '👍', true);
      }
    }
  break;
      
    case 'votesRevealed':
    if (message.storyId) {
      votesRevealed[message.storyId] = true;
  
      const votes = votesPerStory[message.storyId] || {};
      handleVotesRevealed(message.storyId, votes);
      triggerGlobalEmojiBurst();
    }
  break;
      
case 'votesReset':
  if (message.storyId) {
    votesPerStory[message.storyId] = {};
    votesRevealed[message.storyId] = false;

    const selectedCard = document.querySelector('.story-card.selected');
    if (selectedCard && selectedCard.id === message.storyId) {
      resetAllVoteVisuals();

      const planningCardsSection = document.querySelector('.planning-cards-section');
      const statsContainer = document.querySelector('.vote-statistics-container');
      if (planningCardsSection) planningCardsSection.style.display = 'block';
      if (statsContainer) statsContainer.style.display = 'none';
    }
  }
  break;
    
case 'storySelected':
  if (typeof message.storyIndex === 'number') {
    console.log('[SOCKET] Story selected from server:', message.storyIndex);
    currentStoryIndex = message.storyIndex;
    receivedInitialStoryIndex = true;

    // Defer selection until DOM is likely updated after ticket rendering
    setTimeout(() => {
      const storyCards = document.querySelectorAll('.story-card');
      const card = storyCards[message.storyIndex];
      if (card) {
        console.log('[SOCKET] Selecting story after delay');
        selectStory(message.storyIndex, false); // false = don’t emit
        setupPlanningCards();
        setupVoteCardsDrag();

        if (socket) {
          socket.emit('requestStoryVotes', { storyIndex: message.storyIndex });
        }
      } else {
        console.warn('[SOCKET] Could not find card at index', message.storyIndex);
      }
    }, 600); // wait a bit longer than ticket rendering
  }
  break;

       
    case 'storyVotes':
  if (message.storyId) {
    votesPerStory[message.storyId] = message.votes;

    const selectedCard = document.querySelector('.story-card.selected');
    if (selectedCard && selectedCard.id === message.storyId) {
      const hideVotes = !votesRevealed[message.storyId];
      applyVotesToUI(message.votes, hideVotes);
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
    
    // We don't need to re-add manual tickets because displayCSVData now preserves them
    
    // Update UI
    renderCurrentStory();
  }
  break;

    case 'addTicket':
     // Handle new ticket added by another user
  if (message.ticketData) {
    console.log('[SOCKET] New ticket received:', message.ticketData);
    // Add ticket to UI without selecting it (to avoid loops)
    if (message.ticketData.id && message.ticketData.text) {
      addTicketToUI(message.ticketData, false);
    } else {
      console.warn('[SOCKET] Received invalid ticket data:', message.ticketData);
    }
  }
      break;
      
    case 'allTickets':
      // Handle receiving all tickets (used when joining a room)
      if (Array.isArray(message.tickets)) {
        console.log('[SOCKET] Received all tickets:', message.tickets.length);
        processAllTickets(message.tickets);
      }
      break;
      
    case 'connect':
      // When connection is established, request tickets
      setTimeout(() => {
        if (socket && socket.connected && !hasRequestedTickets) {
          console.log('[SOCKET] Connected, requesting all tickets');
          socket.emit('requestAllTickets');
          hasRequestedTickets = true;
        }
      }, 500);
      break;
  }
}

// Initialize on page load
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
  
