// Get username from sessionStorage (already set from main.html or by index.html prompt)
let userName = sessionStorage.getItem('userName');
let processingCSVData = false;
let isCurrentlyEditingStoryPoints = false;
let revealedStoryPoints = {}; 
const isPremiumUser = false;

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

/** function to disable the change language */
function showPremiumUpgradePopup() {
  const modal = document.getElementById('premiumModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}
function ensureSingleStatsContainer(storyId) {
  // Remove any existing stats containers for this story
  const existingContainers = document.querySelectorAll(`.vote-statistics-container[data-story-id="${storyId}"]`);
  if (existingContainers.length > 1) {
    // Keep only the first one, remove the rest
    for (let i = 1; i < existingContainers.length; i++) {
      existingContainers[i].remove();
    }
    console.log(`[CLEANUP] Removed ${existingContainers.length - 1} duplicate stats containers for story ${storyId}`);
  }
}

window.closePremiumModal = function () {
  const modal = document.getElementById('premiumModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

/**
 * Translates incoming tickets to the current guest user's language
 */
async function translateTicketsIfNeeded(tickets) {
  const isGuest = isGuestUser();
  const languageManager = window.languageManager;
  const currentLang = languageManager?.currentLanguage || 'en';

  if (!isGuest || currentLang === 'en') return;

  console.log(`[TRANSLATION] Guest detected. Translating ${tickets.length} ticket(s) to ${currentLang}`);

  for (const ticket of tickets) {
    if (ticket.text) {
      try {
        const translated = await languageManager.translateText(ticket.text, currentLang);
        if (translated && translated !== ticket.text) {
          ticket.text = translated;
          ticket.originalText = ticket.text;
          ticket.translatedText = translated;
        }
      } catch (err) {
        console.warn('[TRANSLATION] Failed to translate ticket:', ticket.text, err);
      }
    }
  }
}

/**
 * Handle adding a ticket from the modal
 * @param {Object} ticketData - Ticket data {id, text}
 */
window.addTicketFromModal = function(ticketData) {
  if (!ticketData || !ticketData.id) return;

  if (deletedStoryIds.has(ticketData.id)) {
    console.log('[MODAL] Cannot add previously deleted ticket:', ticketData.id);
    return;
  }

  console.log('[MODAL] Adding ticket from modal:', ticketData);

  // Check if this is a CSV import or manual add
  const isCSVImport = ticketData.idDisplay !== undefined || ticketData.descriptionDisplay !== undefined;
  
  if (isCSVImport) {
    console.log('[MODAL] Processing CSV import ticket');
    
    if (!ticketData.text && ticketData.idDisplay) {
      ticketData.text = ticketData.idDisplay;
    }
    
    if (typeof emitAddTicket === 'function') {
      emitAddTicket(ticketData);
    } else if (socket) {
      socket.emit('addTicket', ticketData);
    }

    if (ticketData.descriptionDisplay) {
      const card = document.getElementById(ticketData.id);
      if (card) { card.dataset.description = ticketData.descriptionDisplay; }
    }
    addTicketToUI(ticketData, true);
} else {
    console.log('[MODAL] Processing manual ticket add');
    
    const ticketName = document.getElementById('ticketNameInput')?.value?.trim() || '';
    const ticketDescription = window.quill ? window.quill.root.innerHTML.trim() : '';

    const displayText = ticketName && ticketDescription
      ? `${ticketName} : ${ticketDescription}`
      : (ticketName || ticketDescription);

    if (!ticketName && !ticketDescription) {
      console.warn('[MODAL] No valid data for manual ticket add');
      return;
    }

    const hostLang = localStorage.getItem('selectedLanguage') || 'en';

    ticketData.text = displayText;
    ticketData.idDisplay = ticketName;
    ticketData.descriptionDisplay = ticketDescription;
    ticketData.originalText = displayText;
    ticketData.originalLang = hostLang;

    if (typeof emitAddTicket === 'function') {
      emitAddTicket(ticketData);
    } else if (socket) {
      socket.emit('addTicket', ticketData);
    }

    addTicketToUI(ticketData, true);
  }

  manuallyAddedTickets.push(ticketData);
  return;
};

// Script for drop down menu
document.addEventListener('DOMContentLoaded', function() {
  // Toggle menu when avatar/name is clicked
  const trigger = document.getElementById('profileMenuTrigger');
  const menu = document.getElementById('profileMenu');

  if (trigger && menu) {
    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('show');
      document.getElementById('profileMenuAvatar').src = document.querySelector('#headerUserAvatar img')?.src || '';
      document.getElementById('profileMenuName').textContent = sessionStorage.getItem('userName') || "User";
      document.getElementById('profileMenuEmail').textContent = sessionStorage.getItem('userEmail') || "";
      const isHost = isCurrentUserHost();
    const uploadBtn = document.getElementById('uploadTicketMenuBtn');
  const exportBtn = document.getElementById('exportToCsvMenuBtn');

  if (uploadBtn) {
    uploadBtn.style.display = isHost ? 'flex' : 'none';
  }
  if (exportBtn) {
    exportBtn.style.display = isHost ? 'flex' : 'none';
  }
    });

    // Hide menu if clicking outside
    document.addEventListener('click', function(e) {
      if (!menu.contains(e.target) && !trigger.contains(e.target)) {
        menu.classList.remove('show');
      }
    });
  }

  /** ---------- CSV INPUT HANDLER ---------- **/
  const csvInputEl = document.getElementById('csvInput');
  if (csvInputEl) {
    csvInputEl.addEventListener('change', function () {
      if (csvInputEl.files && csvInputEl.files.length > 0) {
        window.selectedCSVFile = csvInputEl.files[0];
        console.log('[CSV] File selected:', window.selectedCSVFile.name);
        var nameEl = document.getElementById('selectedFileName');
        if (nameEl) { nameEl.textContent = window.selectedCSVFile.name; }
      }
    });
  }

  /** ---------- CSV DRAG AND DROP HANDLER ---------- **/
  const dropZone = document.getElementById('csvDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        window.selectedCSVFile = e.dataTransfer.files[0];
      }
    });
  }	

  /** ---------- UPLOAD TICKET MENU OPTION ---------- **/
  const uploadTicketBtn = document.getElementById('uploadTicketMenuBtn');
  if (uploadTicketBtn) {
    uploadTicketBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const csvModal = document.getElementById('csvModal');
      if (csvModal) {
        csvModal.style.display = 'flex';
      }
      menu.classList.remove('show');
    });
  }

  /** ---------- IMPORT BUTTON IN MODAL ---------- **/
  const importCsvBtn = document.getElementById('importCsvBtn');
  if (importCsvBtn) {
    importCsvBtn.addEventListener('click', function () {
      if (!window.selectedCSVFile) {
        return;
      }
      console.log('[CSV] Import button clicked, parsing file:', window.selectedCSVFile.name);
      handleCSVFile(window.selectedCSVFile);
      const csvModal = document.getElementById('csvModal');
      if (csvModal) { csvModal.style.display = 'none'; }
      window.selectedCSVFile = null;
      if (csvInputEl) { csvInputEl.value = ''; }

      if (csvModal) {
        csvModal.style.display = 'none';
      }
    });
  }
  
  /** ---------- CSV FILE PROCESSING ---------- **/
function handleCSVFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const csvText = e.target.result;
    const rows = csvText.split(/\r?\n/).filter(r => r.trim() !== "");

    if (rows.length === 0) {
      alert("CSV file is empty.");
      return;
    }

    // First line = headers
    const headers = rows[0].split(",");
    const dataRows = rows.slice(1).map(r => r.split(","));

    // 🔹 Show preview of first 5 rows in the modal
    if (typeof generateImportPreview === "function") {
      generateImportPreview(headers, dataRows);
    }

    // 🔹 Build tickets from CSV
    const tickets = [];
    dataRows.forEach((cols, idx) => {
      if (cols.length > 0) {
        const id = `story_csv_${Date.now()}_${idx}`;
        const text = cols.join(" ").trim();
        if (text) {
          tickets.push({
            id,
            text,
            idDisplay: cols[0].trim(),
            descriptionDisplay: cols.slice(1).join(" ").trim()
          });
        }
      }
    });

    // 🔹 Import tickets into the app
    if (tickets.length > 0) {
      tickets.forEach(ticket => {
        if (typeof emitAddTicket === "function") {
          emitAddTicket(ticket);
        } else if (socket) {
          socket.emit("addTicket", ticket);
        }
        addTicketToUI(ticket, true);
      });
    } else {
      alert("No valid tickets found in the CSV.");
    }
  };
  reader.readAsText(file);
}


/** ---------- EXPORT TO CSV MENU OPTION ---------- **/
const exportToCsvBtn = document.getElementById('exportToCsvMenuBtn');
if (exportToCsvBtn) {
  exportToCsvBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const exportModal = document.getElementById('exportCsvModal');
    if (exportModal) {
      exportModal.style.display = 'flex';
      populateExportDropdowns();
      generateExportPreview(); // Generate initial preview
    }
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.remove('show');
  });
}

/** ---------- EXPORT MODAL HANDLERS ---------- **/
const closeExportModal = document.getElementById('closeExportCsvModal');
if (closeExportModal) {
  closeExportModal.addEventListener('click', function () {
    const exportModal = document.getElementById('exportCsvModal');
    if (exportModal) {
      exportModal.style.display = 'none';
    }
  });
}

const cancelExportBtn = document.getElementById('cancelExportBtn');
if (cancelExportBtn) {
  cancelExportBtn.addEventListener('click', function () {
    const exportModal = document.getElementById('exportCsvModal');
    if (exportModal) {
      exportModal.style.display = 'none';
    }
  });
}

const generatePreviewBtn = document.getElementById('generatePreviewBtn');
if (generatePreviewBtn) {
  generatePreviewBtn.addEventListener('click', generateExportPreview);
}

const exportCsvBtn = document.getElementById('exportCsvBtn');
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', exportToCsv);
}

// Update preview when mapping changes
const mappingSelects = document.querySelectorAll('.mapping-select, #includeHeader, #onlyRevealedStories, #includeVoteDetails');
mappingSelects.forEach(select => {
  select.addEventListener('change', generateExportPreview);
});

  /** ---------- LOGOUT ---------- **/
  const logoutMenuBtn = document.getElementById('logoutMenuBtn');
  if (logoutMenuBtn) {
    logoutMenuBtn.addEventListener('click', function() {
      sessionStorage.clear();
      window.location.href = 'About.html';
    });
  }

  /** ---------- CHANGE LANGUAGE ---------- **/
  const changeLanguageBtn = document.getElementById('changeLanguageBtn');
  if (changeLanguageBtn) {
    changeLanguageBtn.addEventListener('click', function () {
      const isGuest = isGuestUser();
      if (isGuest || !isPremiumUser) {
        showPremiumUpgradePopup();
      } else {
        window.showLanguageModal();
      }
    });
  }

  /** ---------- QUILL EDITOR ---------- **/
  const quillContainer = document.getElementById('ticketDescriptionEditor');
  if (quillContainer) {
    window.quill = new Quill('#ticketDescriptionEditor', {
      theme: 'snow'
    });
  }
});

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
};

/**
 * Handle updating a ticket from the modal
 * @param {Object} ticketData - Updated ticket data {id, text, isEdit: true}
 */
window.updateTicketFromModal = function(ticketData) {
  if (!ticketData || !ticketData.id) return;

  const ticketName = document.getElementById('ticketNameInput').value?.trim() || '';
  const ticketDescription = window.quill ? window.quill.root.innerHTML.trim() : '';

  const displayText = ticketName && ticketDescription
    ? `${ticketName} : ${ticketDescription}`
    : (ticketName || ticketDescription);

  const hostLang = localStorage.getItem('selectedLanguage') || 'en';

  ticketData.text = displayText;
  ticketData.idDisplay = ticketName;
  ticketData.descriptionDisplay = ticketDescription;
  ticketData.originalText = displayText;
  ticketData.originalLang = hostLang;

  console.log('[UPDATE] Updating ticket from modal:', ticketData);

  updateTicketInUI(ticketData);

  if (socket) {
    socket.emit('updateTicket', ticketData);
  }
};

function updateStoryCardPoint(storyId, value) {
    const card = document.querySelector(`.story-card[data-story-id="${storyId}"] .story-points`);
    if (card) {
        card.textContent = value;
    }
}


/**
 * Update ticket in the UI
 * @param {Object} ticketData - Updated ticket data
 */
function updateTicketInUI(ticketData) {
  if (!ticketData || !ticketData.id) {
    console.warn('[UI] Invalid or empty ticketData passed to updateTicketInUI:', ticketData);
    return;
  }

  const storyCard = document.getElementById(ticketData.id);
  if (!storyCard) return;

  const storyTitle = storyCard.querySelector('.story-title');
  if (!storyTitle) return;

  const userLang = localStorage.getItem('selectedLanguage') || 'en';
  const originalLang = ticketData.originalLang || 'en';
  const originalText = ticketData.originalText || ticketData.text || '[No ticket info]';

  const descriptionHTML = ticketData.descriptionDisplay || ticketData.text || '';
  const idForDisplay = ticketData.idDisplay || '';

  // Extract plain text from description HTML properly
  let previewText = '';
  if (descriptionHTML) {
    const tmpDiv = document.createElement('div');
    tmpDiv.innerHTML = descriptionHTML;
    
    previewText = (tmpDiv.innerText || tmpDiv.textContent || '').trim();
    previewText = previewText.replace(/<[^>]*>/g, '');
    
    if (
      !previewText ||
      descriptionHTML === '' ||
      descriptionHTML === '<p><br></p>' ||
      descriptionHTML === '<p></p>' ||
      descriptionHTML.trim() === ''
    ) {
      previewText = '';
    }
  }

  // Build display text properly
  let displayText;
  if (idForDisplay && previewText) {
    displayText = `${idForDisplay}: ${previewText}`;
  } else if (idForDisplay) {
    displayText = idForDisplay;
  } else if (previewText) {
    displayText = previewText;
  } else {
    displayText = '[No ticket info]';
  }

  // Store metadata on the card
  storyCard.dataset.id = idForDisplay;
  storyCard.dataset.description = descriptionHTML;
  storyCard.dataset.original = displayText;
  storyCard.dataset.originallang = originalLang;

  // Update the display with clean text
  if (userLang === originalLang) {
    storyTitle.textContent = displayText;
  } else {
    if (window.languageManager && typeof window.languageManager.translateText === 'function') {
      window.languageManager.translateText(displayText, userLang).then(translated => {
        storyTitle.textContent = translated;
      }).catch(err => {
        console.error('[Translation] Fallback to original:', err);
        storyTitle.textContent = displayText;
      });
    } else {
      storyTitle.textContent = displayText;
    }
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
 */
function mergeVote(storyId, userName, vote) {
  if (!votesPerStory[storyId]) votesPerStory[storyId] = {};
  if (votesPerStory[storyId][userName] === vote) return;
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
  
  const avatarContainers = document.querySelectorAll('.avatar-container');
  avatarContainers.forEach(container => {
    container.classList.remove('has-voted');
    const avatar = container.querySelector('.avatar-circle');
    if (avatar) {
      avatar.style.backgroundColor = '';
    }
  });
}

function refreshVoteDisplay() {
  try {
    clearAllVoteVisuals();

    const currentStoryId = getCurrentStoryId();
    if (!currentStoryId) return;

    const currentVotes = window.currentVotesPerStory?.[currentStoryId] || {};
    const processedUsernames = new Set();
    const activeUsers = new Map();
    
    document.querySelectorAll('.avatar-container').forEach(container => {
      const userId = container.getAttribute('data-user-id');
      const userName = container.querySelector('.user-name')?.textContent;
      if (userId && userName) {
        activeUsers.set(userName, userId);
      }
    });

    const userVotes = {};
    for (const [socketId, vote] of Object.entries(currentVotes)) {
      const name = userMap?.[socketId] || socketId;
      userVotes[name] = { socketId, vote };
    }

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

function updateVoteCountUI(storyId) {
  try {
    const votes = votesPerStory[storyId] || {};
    const unique = new Set();
    for (const [user, v] of Object.entries(votes)) {
      const name = window.userMap?.[user] || user;
      unique.add(name);
    }
    const count = unique.size;
    
    // Update the vote count in story meta - ALWAYS SHOW THE VOTE COUNT
    const voteCountEl = document.getElementById(`vote-count-${storyId}`);
    if (voteCountEl) {
      // Always show vote count with people icon
      voteCountEl.textContent = `${count} vote${count !== 1 ? 's' : ''}`;
      voteCountEl.style.display = 'flex'; // Always visible
      voteCountEl.classList.add('revealed');
    }
    
    // Also update standardized vote bubble (if it exists)
    const bubbleEl = document.getElementById(`vote-bubble-${storyId}`);
    if (bubbleEl) {
      if (votesRevealed[storyId]) {
        bubbleEl.textContent = count.toString();
      } else {
        bubbleEl.textContent = count > 0 ? '?' : '?';
      }
    }
  } catch (err) {
    console.warn('[VOTE COUNT] update failed', err);
  }
}

/**
 * Generate export preview
 */

function populateExportDropdowns() {
  const stories = collectStoriesForExport();
  if (stories.length === 0) return;

  const fieldMappings = [
    { id: 'storyIdMapping', label: 'Story ID', options: ['skip', 'id'] },
    { id: 'descriptionMapping', label: 'Title/Description', options: ['skip', 'title', 'description'] },
    { id: 'storyPointsMapping', label: 'Story Points', options: ['skip', 'storyPoints'] },
    { id: 'voteCountMapping', label: 'Vote Count', options: ['skip', 'voteCount'] },
    { id: 'averageVoteMapping', label: 'Average Vote', options: ['skip', 'averageVote'] }
  ];

  fieldMappings.forEach(field => {
    const selectEl = document.getElementById(field.id);
    if (!selectEl) return;
    selectEl.innerHTML = '';
    field.options.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = opt === 'skip' ? 'Skip this field' : opt;
      selectEl.appendChild(optionEl);
    });
  });
}

function generateExportPreview() {
  const stories = collectStoriesForExport();
  const mappedData = mapStoriesForExport(stories);
  const csvContent = generateCsvContent(mappedData);
  
  const previewEl = document.getElementById('exportPreview');
  if (previewEl) {
    // Show first 10 lines of the CSV
    const lines = csvContent.split('\n').slice(0, 10);
    const preview = lines.join('\n');
    const totalLines = csvContent.split('\n').length - 1; // -1 for empty last line
    
    previewEl.textContent = preview + (totalLines > 10 ? `\n... (${totalLines - 10} more rows)` : '');
  }
}

/**
 * Collect all stories for export
 */
function collectStoriesForExport() {
  const stories = [];
  const storyCards = document.querySelectorAll('.story-card');
  const onlyRevealed = document.getElementById('onlyRevealedStories')?.checked || false;
  
  storyCards.forEach(card => {
    const storyId = card.id;
    const storyIdDisplay = card.dataset.id || card.querySelector('.story-id')?.textContent || storyId;
    const titleEl = card.querySelector('.story-title');
    const pointsEl = card.querySelector('.story-points');
    const voteCountEl = card.querySelector('.vote-count');
    
    const title = titleEl ? titleEl.textContent : '';
    const description = card.dataset.description || card.getAttribute('data-description') || '';
    const storyPoints = pointsEl ? pointsEl.textContent : '?';
    const isRevealed = votesRevealed[storyId] === true;
    const hasRevealedPoints = revealedStoryPoints[storyId] !== undefined;
    
    // Skip if only revealed stories requested and this story isn't revealed
    if (onlyRevealed && !isRevealed && !hasRevealedPoints) {
      return;
    }
    
    // Get vote statistics
    const votes = votesPerStory[storyId] || {};
    const userMap = window.userMap || {};
    const userVotes = [];
    
    Object.entries(votes).forEach(([socketId, vote]) => {
      const userName = userMap[socketId] || socketId;
      userVotes.push({ userName, vote });
    });
    
    const voteCount = userVotes.length;
    const numericVotes = userVotes
      .map(v => v.vote === '½' ? 0.5 : (isNaN(Number(v.vote)) ? null : Number(v.vote)))
      .filter(v => v !== null);
    
    const averageVote = numericVotes.length > 0 
      ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
      : '';
    
    stories.push({
      storyId: storyIdDisplay,
      title: title,
      description: description,
      fullText: title && description ? `${title}: ${description}` : (title || description),
      storyPoints: storyPoints,
      voteCount: voteCount,
      averageVote: averageVote,
      isRevealed: isRevealed,
      userVotes: userVotes
    });
  });
  
  return stories;
}

/**
 * Map stories according to user's field mapping selection
 */
function mapStoriesForExport(stories) {
  const storyIdMapping = document.getElementById('storyIdMapping')?.value;
  const descriptionMapping = document.getElementById('descriptionMapping')?.value;
  const storyPointsMapping = document.getElementById('storyPointsMapping')?.value;
  const voteCountMapping = document.getElementById('voteCountMapping')?.value;
  const averageVoteMapping = document.getElementById('averageVoteMapping')?.value;
  const includeVoteDetails = document.getElementById('includeVoteDetails')?.checked || false;
  
  // Determine the maximum number of columns needed
  const mappings = [storyIdMapping, descriptionMapping, storyPointsMapping, voteCountMapping, averageVoteMapping];
  const maxColumns = Math.max(...mappings.map(mapping => {
    if (mapping === 'skip') return 0;
    return parseInt(mapping.match(/Column ([A-Z])/)?.[1]?.charCodeAt(0) - 'A'.charCodeAt(0) + 1) || 0;
  })) || 5;
  
  const mappedStories = stories.map(story => {
    const row = [];
    
    // Map fields to columns
    if (storyIdMapping !== 'skip') {
      const colIndex = getColumnIndex(storyIdMapping);
      if (colIndex >= 0) row[colIndex] = story.storyId;
    }
    
    if (descriptionMapping !== 'skip') {
      const colIndex = getColumnIndex(descriptionMapping);
      if (colIndex >= 0) {
        let value = story.fullText;
        if (descriptionMapping === 'title') value = story.title;
        else if (descriptionMapping === 'description') value = story.description;
        row[colIndex] = value;
      }
    }
    
    if (storyPointsMapping !== 'skip') {
      const colIndex = getColumnIndex(storyPointsMapping);
      if (colIndex >= 0) row[colIndex] = story.storyPoints;
    }
    
    if (voteCountMapping !== 'skip') {
      const colIndex = getColumnIndex(voteCountMapping);
      if (colIndex >= 0) row[colIndex] = story.voteCount.toString();
    }
    
    if (averageVoteMapping !== 'skip') {
      const colIndex = getColumnIndex(averageVoteMapping);
      if (colIndex >= 0) row[colIndex] = story.averageVote;
    }
    
    // Add vote details if requested
    if (includeVoteDetails && story.userVotes.length > 0) {
      const voteDetails = story.userVotes.map(v => `${v.userName}:${v.vote}`).join(';');
      row.push(voteDetails);
    }
    
    return row;
  });
  
  return { stories: mappedStories, maxColumns, includeVoteDetails };
}

/**
 * Get column index from mapping value
 */
function getColumnIndex(mapping) {
  if (mapping === 'id') return 0;
  if (mapping === 'title') return 1;
  if (mapping === 'description') return 2;
  if (mapping === 'storyPoints') return 3;
  if (mapping === 'voteCount') return 4;
  if (mapping === 'averageVote') return 5;
  return -1;
}

/**
 * Generate CSV content from mapped data
 */
function generateCsvContent(mappedData) {
  const { stories, maxColumns, includeVoteDetails } = mappedData;
  const includeHeader = document.getElementById('includeHeader')?.checked || false;
  
  let csvContent = '';
  
  // Add header if requested
  if (includeHeader) {
    const headers = [];
    
    // Create headers based on mapping
    const storyIdMapping = document.getElementById('storyIdMapping')?.value;
    const descriptionMapping = document.getElementById('descriptionMapping')?.value;
    const storyPointsMapping = document.getElementById('storyPointsMapping')?.value;
    const voteCountMapping = document.getElementById('voteCountMapping')?.value;
    const averageVoteMapping = document.getElementById('averageVoteMapping')?.value;
    
    for (let i = 0; i < maxColumns; i++) {
      let headerName = `Column ${String.fromCharCode(65 + i)}`;
      
      if (storyIdMapping !== 'skip' && getColumnIndex(storyIdMapping) === i) {
        headerName = 'Story ID';
      } else if (descriptionMapping !== 'skip' && getColumnIndex(descriptionMapping) === i) {
        headerName = descriptionMapping === 'title' ? 'Title' : 
                    descriptionMapping === 'description' ? 'Description' : 'Title/Description';
      } else if (storyPointsMapping !== 'skip' && getColumnIndex(storyPointsMapping) === i) {
        headerName = 'Story Points';
      } else if (voteCountMapping !== 'skip' && getColumnIndex(voteCountMapping) === i) {
        headerName = 'Vote Count';
      } else if (averageVoteMapping !== 'skip' && getColumnIndex(averageVoteMapping) === i) {
        headerName = 'Average Vote';
      }
      
      headers.push(headerName);
    }
    
    if (includeVoteDetails) {
      headers.push('Vote Details');
    }
    
    csvContent += headers.map(escapeCSVField).join(',') + '\n';
  }
  
  // Add data rows
  stories.forEach(row => {
    const csvRow = row.map(field => escapeCSVField(field.toString())).join(',');
    csvContent += csvRow + '\n';
  });
  
  return csvContent;
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSVField(field) {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/**
 * Export to CSV file
 */
function exportToCsv() {
  const stories = collectStoriesForExport();
  
  if (stories.length === 0) {
    alert('No stories to export. Please add some stories first.');
    return;
  }
  
  const mappedData = mapStoriesForExport(stories);
  const csvContent = generateCsvContent(mappedData);
  
  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `planning_poker_export_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Close modal
  const exportModal = document.getElementById('exportCsvModal');
  if (exportModal) {
    exportModal.style.display = 'none';
  }
  
  console.log(`[EXPORT] Successfully exported ${stories.length} stories to CSV`);
}


function updateVoteBadges(storyId, votes) {
  const voteCount = Object.keys(votes).length;
  console.log(`Story ${storyId} has ${voteCount} votes`);

  const voteBadge = document.querySelector(`#vote-badge-${storyId}`);
  if (voteBadge) {
    voteBadge.textContent = voteCount;
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
  if (window.userNameReady === false) {
    console.log('[APP] Waiting for username before initializing app');
    return;
  }
  
  let roomId = getRoomIdFromURL();
  if (!roomId) {
    roomId = 'room-' + Math.floor(Math.random() * 10000);
  }
  appendRoomIdToURL(roomId);
  
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
let votesPerStory = {};
let votesRevealed = {};
let manuallyAddedTickets = [];
let hasRequestedTickets = false;
let reconnectingInProgress = false;
let currentEditingTicketId = null;

// Adding this function to fix revealed vote font sizes
function fixRevealedVoteFontSizes() {
  console.log('[DEBUG] Fixing revealed vote font sizes');
  const voteCards = document.querySelectorAll('.vote-card-space.has-vote .vote-badge');
  
  voteCards.forEach(badge => {
    const text = badge.textContent || '';
    let fontSize = '18px';
    
    if (text.length >= 2) {
      fontSize = '16px';
    }
    
    if (text.includes('XX')) {
      fontSize = '14px';
    }
    
    badge.style.fontSize = fontSize;
    badge.style.fontWeight = '600';
    badge.style.maxWidth = '80%';
    badge.style.textAlign = 'center';
    badge.style.display = 'block';
    
    console.log(`[DEBUG] Applied font size ${fontSize} to vote badge with text "${text}"`);
  });
}

function addFixedVoteStatisticsStyles() {
  const existingStyle = document.getElementById('fixed-vote-statistics-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  const style = document.createElement('style');
  style.id = 'fixed-vote-statistics-styles';
  
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
  const numericValues = voteValues
    .filter(v => !isNaN(parseFloat(v)) && v !== null && v !== undefined)
    .map(v => parseFloat(v));

  let mostCommonVote = voteValues.length > 0 ? voteValues[0] : '0';
  let voteCount = voteValues.length;
  let averageValue = 0;

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
  const isHostFromStorage = sessionStorage.getItem('isHost');
  if (isHostFromStorage !== null) {
    return isHostFromStorage === 'false';
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  const hasRoomId = urlParams.has('roomId');
  const isRoomCreator = sessionStorage.getItem('isRoomCreator') === 'true';
  
  return hasRoomId && !isRoomCreator;
}

/**
 * Determines if current user is the host
 */
function isCurrentUserHost() {
  const isHostFromStorage = sessionStorage.getItem('isHost');
  if (isHostFromStorage !== null) {
    return isHostFromStorage === 'true';
  }
  
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

  container.innerHTML = '';

  values.forEach(value => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-value', value);
    card.setAttribute('draggable', 'true');
    card.textContent = value;
    container.appendChild(card);
  });

  setupVoteCardsDrag();
}

/**
 * Set up guest mode restrictions
 */
function setupGuestModeRestrictions() {
  if (isGuestUser()) {
    const revealVotesBtn = document.getElementById('revealVotesBtn');
    const resetVotesBtn = document.getElementById('resetVotesBtn');
    if (revealVotesBtn) revealVotesBtn.classList.add('hide-for-guests');
    if (resetVotesBtn) resetVotesBtn.classList.add('hide-for-guests');
    
    const fileInputContainer = document.getElementById('fileInputContainer');
    if (fileInputContainer) fileInputContainer.classList.add('hide-for-guests');
    
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
  return roomId || 'room-' + Math.floor(Math.random() * 10000);
}

/**
 * Append room ID to URL if not already present
 */
function appendRoomIdToURL(roomId) {
  if (!window.location.href.includes('roomId=')) {
    const newUrl = window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'roomId=' + roomId;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }
}

/**
 * Initialize the application
 */
function initializeApp(roomId) {
  socket = initializeWebSocket(roomId, userName, handleSocketMessage);
  socket.on('connect', () => {
    if (!window.userMap) window.userMap = {};
    window.userMap[socket.id] = userName;
  });

  if (socket && socket.io) {
    socket.io.reconnectionAttempts = 10;
    socket.io.timeout = 20000;
    socket.io.reconnectionDelay = 2000;
  }

  socket.on('voteUpdate', ({ userId, userName, vote, storyId }) => {
    const name = userName || userId;
    mergeVote(storyId, name, vote);

    const currentId = getCurrentStoryId();
    if (storyId === currentId) {
      updateVoteVisuals(name, votesRevealed[storyId] ? vote : '👍', true);
    }

    refreshVoteDisplay();
    // **FIXED: Update vote count after vote update**
    updateVoteCountUI(storyId);
  });

socket.on('storyPointsUpdate', ({ storyId, points }) => {
    console.log(`[SOCKET] Story points update received from server: ${storyId} = ${points}`);

    if (!storyId) {
        console.error('[SOCKET] storyPointsUpdate: Missing storyId');
        return; // Stop processing if storyId is missing
    }

    const pointsEl = document.getElementById(`story-points-${storyId}`);
    if (pointsEl) {
        // Remove this check to always process updates from the server
        // const isCurrentlyEditing = pointsEl.classList.contains('editing');
        // if (!isCurrentlyEditing) {

        const oldValue = pointsEl.textContent;
        pointsEl.textContent = points;
        console.log(`[SOCKET] Updated story points display: ${storyId} from "${oldValue}" to "${points}"`);
        // } else {
        //  console.log(`[SOCKET] Skipping update - element is being edited by current user`);
        //}
    } else {
        console.warn(`[SOCKET] Could not find story points element: story-points-${storyId}`);

        // Debug: List all story-points elements to help diagnose.  Wrap in try/catch
        try {
            const allPointsElements = document.querySelectorAll('[id^="story-points-"]');
            console.log(`[SOCKET] Available story-points elements:`, Array.from(allPointsElements).map(el => el.id));
        } catch (err) {
            console.error('[SOCKET] Error during element query:', err);
        }
    }

    const storyCard = document.getElementById(storyId);
    if (storyCard) {
        storyCard.dataset.storyPoints = points;
        console.log(`[SOCKET] Updated story card dataset for ${storyId}`);
    } else {
        console.error('[SOCKET] storyPointsUpdate: Could not find story card for:', storyId);
    }

    // Send acknowledgement to server, including error handling in the callback
    if (socket && socket.connected) {
        socket.emit('ack', { type: 'storyPointsUpdate', storyId: storyId }, (ackError) => {
            if (ackError) {
                console.error('[SOCKET] Error sending acknowledgement:', ackError);
            } else {
                console.log('[SOCKET] Acknowledgement sent successfully for storyId:', storyId);
            }
        });
    } else {
        console.warn('[SOCKET] Cannot send acknowledgement - no socket connection');
    }

});

  
  socket.on('storyVotes', ({ storyId, votes }) => {
    if (deletedStoryIds.has(storyId)) {
      console.log(`[VOTE] Ignoring votes for deleted story: ${storyId}`);
      return;
    }
    
    if (!votesPerStory[storyId]) {
      votesPerStory[storyId] = {};
    }
    
    votesPerStory[storyId] = { ...votes };
    window.currentVotesPerStory = votesPerStory;
    
    const currentStoryId = getCurrentStoryId();
    if (currentStoryId === storyId) {
      if (votesRevealed[storyId]) {
        applyVotesToUI(votes, false);
      } else {
        applyVotesToUI(votes, true);
      }
      // **FIXED: Update vote count when story votes received**
      updateVoteCountUI(storyId);
    }
  });
  
  socket.on('restoreUserVote', ({ storyId, vote }) => {
    const name = sessionStorage.getItem('userName') || socket.id;
    mergeVote(storyId, name, vote);
    refreshVoteDisplay();
    // **FIXED: Update vote count when vote restored**
    updateVoteCountUI(storyId);
  });
  
socket.on('resyncState', ({ tickets, votesPerStory: serverVotes, votesRevealed: serverRevealed, deletedStoryIds: serverDeletedIds }) => {
  console.log('[SOCKET] Received resyncState from server');

  if (Array.isArray(serverDeletedIds)) {
    serverDeletedIds.forEach(id => deletedStoryIds.add(id));
    saveDeletedStoriesToStorage(roomId);
  }

  const filteredTickets = (tickets || []).filter(ticket => !deletedStoryIds.has(ticket.id));
  if (Array.isArray(filteredTickets)) {
    processAllTickets(filteredTickets);
  }

  if (serverVotes) {
    for (const [storyId, votes] of Object.entries(serverVotes)) {
      if (deletedStoryIds.has(storyId)) continue;

      if (!votesPerStory[storyId]) votesPerStory[storyId] = {};

      for (const [userId, vote] of Object.entries(votes)) {
        mergeVote(storyId, userId, vote);
      }

      const isRevealed = serverRevealed && serverRevealed[storyId];
      votesRevealed[storyId] = isRevealed;

      const currentId = getCurrentStoryId();
      if (storyId === currentId) {
        if (isRevealed) {
          applyVotesToUI(votes, false);
          handleVotesRevealed(storyId, votes);
        } else {
          applyVotesToUI(votes, true);
        }
        updateVoteCountUI(storyId);   // ✅ always refresh bubble for current story
      } else {
        if (isRevealed) {
          handleVotesRevealed(storyId, votes);
        }
        updateVoteCountUI(storyId);   // ✅ always refresh bubble for *non-current* stories too
      }
    }
  }

  console.log('[RESTORE] Skipped manual session restoration — server handles vote recovery');
  window.currentVotesPerStory = votesPerStory;
  refreshVoteDisplay();
});

  
  socket.on('deleteStory', ({ storyId }) => {
    console.log('[SOCKET] Story deletion event received:', storyId);
    
    deletedStoryIds.add(storyId);
    saveDeletedStoriesToStorage(roomId);
    
    const el = document.getElementById(storyId);
    if (el) {
      el.remove();
      normalizeStoryIndexes();
    }
    
    delete votesPerStory[storyId];
    delete votesRevealed[storyId];
  });
  
  socket.on('votesRevealed', ({ storyId }) => {
    if (deletedStoryIds.has(storyId)) return;
    if (votesRevealed[storyId] === true) {
      console.log(`[VOTE] Votes already revealed for story ${storyId}, not triggering effects again`);
      return;
    }

    votesRevealed[storyId] = true;
    const votes = votesPerStory[storyId] || {};

    const planningCardsSection = document.querySelector('.planning-cards-section');
    if (planningCardsSection) {
      planningCardsSection.classList.add('hidden-until-init');
      planningCardsSection.style.display = 'none';
    }

    handleVotesRevealed(storyId, votes);
    updateVoteCountUI(storyId);

    console.log(`[VOTE] Votes revealed for story: ${storyId}, stats should now be visible`);
  });
  
  // Improved the storySelected event handler
  socket.on('storySelected', ({ storyIndex, storyId }) => {
    console.log('[SOCKET] storySelected received:', storyIndex, storyId);
    clearAllVoteVisuals();
    
    if (storyId) {
      selectStory(storyIndex, false);
      return;
    }
    
    if (typeof storyIndex === 'number') {
      const storyCards = document.querySelectorAll('.story-card');
      if (storyIndex >= 0 && storyIndex < storyCards.length) {
        const targetCard = storyCards[storyIndex];
        if (targetCard && targetCard.id) {
          console.log(`[SOCKET] Resolved storyId from index ${storyIndex}: ${targetCard.id}`);
          selectStory(storyIndex, false);
          return;
        }
      }
      
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
    socket.on('reconnect_attempt', (attempt) => {
      console.log(`[SOCKET] Reconnection attempt ${attempt}`);
      reconnectingInProgress = true;
      updateConnectionStatus('reconnecting');
    });
    
    socket.on('reconnect', () => {
      console.log('[SOCKET] Reconnected to server');
      reconnectingInProgress = false;
      updateConnectionStatus('connected');

      socket.emit('requestAllTickets');
      socket.emit('requestCurrentStory');
      setTimeout(() => {
        socket.emit('requestFullStateResync');

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
  
  socket.on('votingSystemUpdate', ({ votingSystem }) => {
    console.log('[SOCKET] Received voting system from host:', votingSystem);
    sessionStorage.setItem('votingSystem', votingSystem);
    setupPlanningCards();
  });

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
  setupPlanningCards();
  setupRevealResetButtons();
  setupAddTicketButton();
  setupGuestModeRestrictions();
  setupStoryCardInteractions();
  
  cleanupDeleteButtonHandlers();
  setupCSVDeleteButtons();
  
  addNewLayoutStyles();
  
  setInterval(refreshCurrentStoryVotes, 30000);

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
  
  if (!storyId || deletedStoryIds.has(storyId)) return;
  
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
    
    .card {
      width: 45px;
      height: 50px;
      padding: 10px;
      background: #cfc6f7;
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
      color: #673ab7 !important;
      opacity: 1 !important;
      transition: none;
    }
    
    .vote-card-space .vote-badge {
      font-size: 24px;
      visibility: visible !important;
    }
    
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
    
    .story-card {
      position: relative;
      padding-right: 35px;
    }
    
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
  
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'connection-status';
  statusIndicator.id = 'connectionStatus';
  statusIndicator.textContent = 'Connected';
  document.body.appendChild(statusIndicator);
  
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
  
  statusIndicator.classList.remove('connected', 'reconnecting', 'error');
  
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
    const newBtn = btn.cloneNode(true);
    if (btn.parentNode) {
      btn.parentNode.replaceChild(newBtn, btn);
    }
  });
  console.log(`[CLEANUP] Removed event listeners from ${deleteButtons.length} delete buttons`);
}

/**
 * Setup delegation-based event handling for CSV story delete buttons
 */
function setupCSVDeleteButtons() {
  console.log('[SETUP] CSV delete button handler disabled - using 3-dot menus instead');
}

/**
 * Delete a story by ID with duplicate confirmation prevention
 */
function deleteStory(storyId) {
  console.log('[DELETE] Attempting to delete story:', storyId);
  
  if (deleteConfirmationInProgress) {
    console.log('[DELETE] Delete confirmation already in progress, ignoring duplicate call');
    return;
  }
  
  deleteConfirmationInProgress = true;
  
  const confirmResult = confirm('Are you sure you want to delete this story?');
  
  setTimeout(() => {
    deleteConfirmationInProgress = false;
  }, 100);
  
  if (!confirmResult) {
    console.log('[DELETE] User canceled deletion');
    return;
  }
  
  const storyCard = document.getElementById(storyId);
  if (!storyCard) {
    console.error('[DELETE] Story card not found:', storyId);
    return;
  }

  console.log('[DELETE] Found story card, proceeding with deletion');
  
  deletedStoryIds.add(storyId);
  
  const roomId = getRoomIdFromURL();
  saveDeletedStoriesToStorage(roomId);
  
  const index = parseInt(storyCard.dataset.index);
  
  const isCsvStory = storyId.startsWith('story_csv_');
  
  if (socket) {
    console.log('[DELETE] Emitting deleteStory event to server');
    
    if (isCsvStory) {
      const csvIndex = parseInt(storyId.replace('story_csv_', ''));
      socket.emit('deleteStory', { storyId, isCsvStory: true, csvIndex });
    } else {
      socket.emit('deleteStory', { storyId });
    }
  } else {
    console.warn('[DELETE] Socket not available, deleting locally only');
  }
  
  storyCard.remove();
  
  delete votesPerStory[storyId];
  delete votesRevealed[storyId];
  
  if (index === currentStoryIndex) {
    const storyList = document.getElementById('storyList');
    if (storyList && storyList.children.length > 0) {
      const newIndex = Math.min(index, storyList.children.length - 1);
      selectStory(newIndex, true);
    }
  }
  
  normalizeStoryIndexes();
  
  console.log('[DELETE] Deletion complete for story:', storyId);
}

function createVoteStatisticsDisplay(votes) {
  const container = document.createElement('div');
  container.className = 'vote-statistics-display';
  
  const voteValues = Object.values(votes);
  const numericValues = voteValues
    .filter(v => !isNaN(parseFloat(v)) && v !== null && v !== undefined)
    .map(v => parseFloat(v));
  
  let mostCommonVote = voteValues.length > 0 ? voteValues[0] : 'No votes';
  let voteCount = voteValues.length;
  let averageValue = 0;
  let agreementPercent = 0;
  
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
    
    agreementPercent = (maxCount / voteValues.length) * 100;
  }
  
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

function getAgreementColor(percentage) {
  if (percentage === 100) return '#00e676';
  if (percentage >= 75) return '#76ff03';
  if (percentage >= 50) return '#ffeb3b';
  if (percentage >= 0) return '#FFEB3B';
  return '#ff9100';
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

  if (typeof addFixedVoteStatisticsStyles === 'function') {
    addFixedVoteStatisticsStyles();
  }

  applyVotesToUI(votes, false);

  const userMap = window.userMap || {};
  const usernameToVote = {};

  Object.entries(votes).forEach(([socketId, vote]) => {
    const userName = userMap[socketId] || socketId;
    usernameToVote[userName] = vote;
  });

  const uniqueVotes = Object.values(usernameToVote);

  let mostCommonVote = '?';
  if (uniqueVotes.length > 0) {
    const freq = {};
    let max = 0;
    uniqueVotes.forEach(v => {
      freq[v] = (freq[v] || 0) + 1;
      if (freq[v] > max) { max = freq[v]; mostCommonVote = v; }
    });
  }

  // Store the revealed story points
  revealedStoryPoints[storyId] = mostCommonVote;

  // Calculate numeric average
  const numericVotes = uniqueVotes
    .map(v => v === '½' ? 0.5 : (isNaN(Number(v)) ? null : Number(v)))
    .filter(v => v !== null);
  let averageValue = '';
  if (numericVotes.length > 0) {
    averageValue = (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1);
  }

  // ✅ ENSURE PLANNING CARDS ARE HIDDEN FIRST
  const planningCardsSection = document.querySelector('.planning-cards-section');
  if (planningCardsSection) {
    planningCardsSection.classList.add('hidden-until-init');
    planningCardsSection.style.display = 'none';
  }

  // Remove any existing stats containers for this story
  document.querySelectorAll(`.vote-statistics-container[data-story-id="${storyId}"]`).forEach(el => el.remove());

  // ✅ ONLY CREATE STATS FOR THE CURRENT STORY
  const currentStoryId = getCurrentStoryId();
  if (storyId === currentStoryId) {
    // Create stats panel
    const statsContainer = document.createElement('div');
    statsContainer.className = 'vote-statistics-container';
    statsContainer.setAttribute('data-story-id', storyId);
    statsContainer.innerHTML = `
      <div class="fixed-vote-display">
        <div class="fixed-vote-card">
          ${mostCommonVote}
          <div class="fixed-vote-count">${uniqueVotes.length} Vote${uniqueVotes.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="fixed-vote-stats">
          <div class="fixed-stat-group">
            <div class="fixed-stat-label">Average:</div>
            <div class="fixed-stat-value">${averageValue || '-'}</div>
          </div>
          <div class="fixed-stat-group">
            <div class="fixed-stat-label">Agreement:</div>
            <div class="fixed-agreement-circle"><div class="agreement-icon">👍</div></div>
          </div>
        </div>
      </div>
    `;

    if (planningCardsSection && planningCardsSection.parentNode) {
      planningCardsSection.parentNode.insertBefore(statsContainer, planningCardsSection.nextSibling);
    } else {
      document.body.appendChild(statsContainer);
    }
    statsContainer.style.display = 'block';
  }

  // Update story points display in the card's meta section
  const pointsEl = document.getElementById(`story-points-${storyId}`);
  if (pointsEl && mostCommonVote !== '?') {
    pointsEl.textContent = mostCommonVote;
    pointsEl.classList.add('revealed');
  }
  
  // Update vote count display in the card's meta section
  updateVoteCountUI(storyId);
  ensureSingleStatsContainer(storyId);
}


/**
 * Setup Add Ticket button
 */
function setupAddTicketButton() {
  const addTicketBtn = document.getElementById('addTicketBtn');
  if (!addTicketBtn) return;

  addTicketBtn.addEventListener('click', () => {
    if (typeof window.showAddTicketModal === 'function') {
      window.showAddTicketModal();
    } else {
      const storyText = prompt("Enter the story details:");
      if (storyText && storyText.trim()) {
        const ticketData = {
          id: `story_${Date.now()}`,
          text: storyText.trim()
        };
        
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

  if (deletedStoryIds.has(ticketData.id)) {
    console.log('[ADD] Not adding deleted ticket to UI:', ticketData.id);
    return;
  }

  const storyList = document.getElementById('storyList');
  if (!storyList) return;

  const existingTicket = document.getElementById(ticketData.id);
  if (existingTicket) return;

  const storyCard = document.createElement('div');
  storyCard.className = 'story-card';
  storyCard.id = ticketData.id;

  const newIndex = storyList.children.length;
  storyCard.dataset.index = newIndex;

  // Extract ID and description
  const idForDisplay = ticketData.idDisplay !== undefined ? ticketData.idDisplay : (
    ticketData.id.startsWith('story_csv_') && ticketData.id.replace(/^story_csv_/, '') !== '' ? 
    ticketData.id.replace(/^story_csv_/, '') : ticketData.id
  );
  
  let descriptionForDisplay = ticketData.descriptionDisplay !== undefined ? 
    ticketData.descriptionDisplay : ticketData.text;

  // Clean HTML from description if present
  if (descriptionForDisplay) {
    const tmpDiv = document.createElement('div');
    tmpDiv.innerHTML = descriptionForDisplay;
    descriptionForDisplay = tmpDiv.innerText || tmpDiv.textContent || '';
  }

  // Store metadata
  storyCard.dataset.id = idForDisplay;
  storyCard.dataset.description = descriptionForDisplay;
  storyCard.dataset.storyId = ticketData.id;

  // Create story ID element (purple, bold, at top)
  const storyId = document.createElement('div');
  storyId.className = 'story-id';
  storyId.textContent = idForDisplay;
  storyCard.appendChild(storyId);

  // Create story title/description element
  const storyTitle = document.createElement('div');
  storyTitle.className = 'story-title';
  storyTitle.textContent = descriptionForDisplay || 'No description';
  storyCard.appendChild(storyTitle);

  // Story meta container (vote count + story points)
  const storyMeta = document.createElement('div');
  storyMeta.className = 'story-meta';

  // Vote count element (bottom left)
  const voteCountEl = document.createElement('div');
  voteCountEl.className = 'vote-count';
  voteCountEl.id = `vote-count-${ticketData.id}`;
  voteCountEl.textContent = '0 votes';
  storyMeta.appendChild(voteCountEl);

  // Story points element (bottom right, green)
  const storyPointsEl = document.createElement('div');
  storyPointsEl.className = 'story-points';
  storyPointsEl.id = `story-points-${ticketData.id}`;
  storyPointsEl.textContent = (ticketData.points !== undefined && ticketData.points !== null) ? 
    String(ticketData.points) : '?';
  storyMeta.appendChild(storyPointsEl);

  storyCard.appendChild(storyMeta);


storyPointsEl.addEventListener('click', (e) => {
  e.stopPropagation();
  
const storyItem = e.target.closest('.story-card'); // Ensure the correct element is used
    const current = storyPointsEl.textContent.trim();


    if (isCurrentlyEditingStoryPoints) {
        console.log('[EDIT] Already editing another field, ignoring click');
        return;
    }

    isCurrentlyEditingStoryPoints = true;
    // Indicate that no other fields can be edited until this one is committed or canceled
    storyPointsEl.classList.add('editing');


    const input = document.createElement('input');
    input.type = 'text';
    input.value = current === '?' ? '' : current;
    input.style.cssText = 'width: 40px; text-align: center; font-size: 12px; font-weight: 700; background: #10b981; color: white; border: none; border-radius: 6px;';
    storyPointsEl.textContent = '';
    storyPointsEl.appendChild(input);
    input.focus();
    input.select();


    input.addEventListener('blur', () => {
        commit(storyItem, input);
        isCurrentlyEditingStoryPoints = false;
        // Now other fields can be edited again
    });


    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            commit(storyItem, input);
            isCurrentlyEditingStoryPoints = false;
            // Now other fields can be edited again
        } else if (e.key === 'Escape') {
            storyPointsEl.classList.remove('editing');
            storyPointsEl.textContent = current;
            isCurrentlyEditingStoryPoints = false; // Allow editing other fields if ESC is pressed
            // Now other fields can be edited again
        }
    });
});

  // Add 3-dot menu for hosts only
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
    storyCard.appendChild(actionsContainer);

    // Event listeners for menu
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

  // Event handling based on user role
  if (isGuestUser()) {
    storyCard.classList.add('disabled-story');
  } else {
    storyCard.addEventListener('click', () => {
      selectStory(newIndex);
    });
  }

  if (selectAfterAdd && !isGuestUser()) {
    selectStory(newIndex);
  }

  // Hide no stories message
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

  // Translation handling if needed
  if (window.languageManager && window.languageManager.currentLanguage !== 'en') {
    if (typeof window.languageManager.translateTexts === 'function') {
      window.languageManager.translateTexts([storyTitle.textContent]).then((translatedText) => {
        if (typeof window.languageManager.applyTranslation === 'function') {
          window.languageManager.applyTranslation({element: storyTitle, type: 'text'}, translatedText[0]);
        }
      }).catch(err => {
        console.warn('Translation failed:', err);
      });
    }
  }
}

/**
 * Set up a mutation observer to catch any newly added story cards
 */
function setupStoryCardObserver() {
  if (!isGuestUser()) return;
  
  const storyList = document.getElementById('storyList');
  if (!storyList) return;
  
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
  
  observer.observe(storyList, { 
    childList: true, 
    subtree: true 
  });
}

/**
 * Apply guest restrictions to all story cards
 */
function applyGuestRestrictions() {
  if (!isGuestUser()) return;

  const storyCards = document.querySelectorAll('.story-card');
  storyCards.forEach(card => {
    card.classList.add('disabled-story');

    const actionsContainer = card.querySelector('.story-actions');
    if (actionsContainer) {
      const menuBtn = actionsContainer.querySelector('.story-menu-btn');
      const dropdown = actionsContainer.querySelector('.story-menu-dropdown');

      if (menuBtn && dropdown) {
        // Leave menu enabled
      }
    } else {
      const newCard = card.cloneNode(true);
      if (card.parentNode) {
        card.parentNode.replaceChild(newCard, card);
      }
    }
  });

  const uploadBtn = document.getElementById('uploadCSVBtn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.classList.add('disabled');
    uploadBtn.title = 'Guests cannot upload CSVs';
  }

  const addTicketBtn = document.getElementById('addTicketBtn');
  if (addTicketBtn) {
    addTicketBtn.disabled = true;
    addTicketBtn.classList.add('disabled');
    addTicketBtn.title = 'Guests cannot add new tickets';
  }
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

  const userLang = localStorage.getItem('selectedLanguage') || 'en';

  filtered.forEach(ticket => {
    if (ticket?.id && ticket?.text) {
      ticket.originalText = ticket.text;
      ticket.originalLang = userLang;
      addTicketToUI(ticket, false);
    }
  });

  if (filtered.length > 0) {
    if (currentStoryIndex === null || currentStoryIndex === undefined || currentStoryIndex < 0 || currentStoryIndex >= filtered.length) {
      currentStoryIndex = 0;
if (stories && stories.length > 0) {
  selectStory(0, false);
} else {
  console.warn("[UI] No stories available, skipping auto-select");
}
    } else {
      console.log('[INIT] Skipping auto-select, currentStoryIndex already set:', currentStoryIndex);
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
        
        votesRevealed[storyId] = true;
        
        const votes = votesPerStory[storyId] || {};
        
        applyVotesToUI(votes, false);
        
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.add('hidden-until-init');
          planningCardsSection.style.display = 'none';
        }
        
        handleVotesRevealed(storyId, votes);
        updateVoteCountUI(storyId);
        
        triggerGlobalEmojiBurst();
        
        socket.emit('revealVotes', { storyId });
      }
    });
  }

  const resetVotesBtn = document.getElementById('resetVotesBtn');
  if (resetVotesBtn) {
    resetVotesBtn.addEventListener('click', () => {
      const storyId = getCurrentStoryId();
      if (socket && storyId) {
        if (votesPerStory[storyId]) {
          votesPerStory[storyId] = {};
        }
        votesRevealed[storyId] = false;
        
        resetAllVoteVisuals();

      const pointsEl = document.getElementById(`story-points-${storyId}`);
      if (pointsEl) {
     pointsEl.textContent = '?';
     // pointsEl.textContent = revealedStoryPoints[story.id] || '?';

        pointsEl.classList.remove('revealed');
      }
        
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.remove('hidden-until-init');
          planningCardsSection.style.display = 'block';
        }
        
        const statsContainer = document.querySelector(`.vote-statistics-container[data-story-id="${storyId}"]`);
        if (statsContainer) {
          statsContainer.style.display = 'none';
        }
        
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

  console.log('[CSV] Old CSV uploader disabled - using new modal system');
  
  csvInput.style.display = 'none';
  csvInput.disabled = true;
  
  const newInput = csvInput.cloneNode(true);
  if (csvInput.parentNode) {
    csvInput.parentNode.replaceChild(newInput, csvInput);
  }
  
  const fileInputContainer = document.getElementById('fileInputContainer');
  if (fileInputContainer) {
    fileInputContainer.style.display = 'none';
  }
  
  return;
}
function commit(storyEl, input) {
    const newVal = input.value.trim() || '?';
    const storyPointsEl = storyEl.querySelector('.story-points');


    if (storyPointsEl) {
        storyPointsEl.classList.remove('editing'); // Remove editing state first


        storyPointsEl.textContent = newVal;  // Update the story points text content
        storyEl.dataset.storyPoints = newVal; // Update the story card's dataset


        if (socket && socket.connected) {
            const id = storyEl.dataset.storyId || storyEl.id;  // Use the data attribute or ID
            console.log(`[POINTS] Broadcasting story points update: ${id} = ${newVal}`);
            socket.emit('updateStoryPoints', { storyId: id, points: newVal });
        }
    }


    isCurrentlyEditingStoryPoints = false; // Allow editing another story after committing changes
}

/**
 * Parse CSV text into array structure
 */
function parseCSV(text) {
  const delimiter = text.includes('\t') ? '\t' : ',';
  console.log(`[CSV] Detected delimiter: ${delimiter === '\t' ? 'tab' : 'comma'}`);

  const rows = text
    .trim()
    .split('\n')
    .filter(row => row.trim().length > 0)
    .map(row => row.split(delimiter).map(cell => cell.trim()));

  if (rows.length === 0) {
    console.log("[CSV] No rows to parse");
    return [];
  }

  const headersNormalized = rows[0].map(h => h.replace(/\s/g, '').toLowerCase());
  const idIdx = headersNormalized.indexOf('id');
  const descIdx = headersNormalized.indexOf('description');
  const hasHeaders = idIdx !== -1 && descIdx !== -1;
  console.log(`[CSV] Headers detected: ${hasHeaders}`);

  let parsed = [];

  if (hasHeaders) {
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
    card.onclick = () => selectStory(index);
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

      const storyId = card.querySelector('.story-id');
      const storyTitle = card.querySelector('.story-title');
      if (storyId && storyTitle) {
        existingStories.push({
          id: card.id,
          idDisplay: card.dataset.id || storyId.textContent || '',
          descriptionDisplay: card.dataset.description || storyTitle.textContent || '',
          text: `${storyId.textContent}: ${storyTitle.textContent}`
        });
      }
    });

    console.log(`[CSV] Saved ${existingStories.length} existing manual stories`);

    storyListContainer.querySelectorAll('.story-card[id^="story_csv_"]').forEach(card => card.remove());
    storyListContainer.innerHTML = '';

    // Re-add manual stories with new layout
    existingStories.forEach((story, index) => {
      if (deletedStoryIds.has(story.id)) return;

      const storyItem = document.createElement('div');
      storyItem.classList.add('story-card');
      storyItem.id = story.id;
      storyItem.dataset.index = index;
      storyItem.dataset.id = story.idDisplay || '';
      storyItem.dataset.description = story.descriptionDisplay || '';

      // Create story ID element (purple, bold, at top)
      const storyId = document.createElement('div');
      storyId.className = 'story-id';
      storyId.textContent = story.idDisplay || story.id;
      storyItem.appendChild(storyId);

      // Create story title/description element
      const storyTitle = document.createElement('div');
      storyTitle.classList.add('story-title');
      storyTitle.textContent = story.descriptionDisplay || 'No description';
      storyItem.appendChild(storyTitle);

      // Add Feature tag - ADDED THIS SECTION
      const featureTag = document.createElement('div');
      featureTag.className = 'story-feature-tag';
      featureTag.textContent = 'Feature';
      storyItem.appendChild(featureTag);

      // Story meta container (vote count + story points)
      const storyMeta = document.createElement('div');
      storyMeta.className = 'story-meta';

      // Vote count element (bottom left with people icon)
      const voteCountEl = document.createElement('div');
      voteCountEl.className = 'vote-count';
      voteCountEl.id = `vote-count-${story.id}`;
      voteCountEl.textContent = '0 votes';
      storyMeta.appendChild(voteCountEl);

      // Story points element (bottom right, green)
      const storyPointsEl = document.createElement('div');
      storyPointsEl.className = 'story-points';
      storyPointsEl.id = `story-points-${story.id}`;
      storyPointsEl.textContent = textContent = '?';
      
      // Add story points editing functionality
      storyPointsEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = storyPointsEl.textContent.trim();
        storyPointsEl.classList.add('editing');
  const storyItem = storyPointsEl.closest('.story-card');
  storyPointsEl.classList.add('editing');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = current === '?' ? '' : current;
        input.style.cssText = 'width: 40px; text-align: center; font-size: 12px; font-weight: 700; background: #10b981; color: white; border: none; border-radius: 6px;';
        storyPointsEl.textContent = '';
        storyPointsEl.appendChild(input);
        input.focus();
        input.select();

        commit(storyCard);

        input.addEventListener('blur', () => commit(storyItem, input));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            commit(storyItem, input);
          } else if (e.key === 'Escape') {
            storyPointsEl.classList.remove('editing');
            storyPointsEl.textContent = current;
          }
        });
      });

      storyMeta.appendChild(storyPointsEl);
      storyItem.appendChild(storyMeta);

      // Add 3-dot menu for hosts
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
          editStory({
            id: story.id,
            idDisplay: storyItem.dataset.id,
            descriptionDisplay: storyItem.dataset.description,
            text: `${storyId.textContent}: ${storyTitle.textContent}`
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

    // Add CSV stories with new layout
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

      // Create story ID element (purple, bold, at top)
      const storyId = document.createElement('div');
      storyId.className = 'story-id';
      storyId.textContent = rawId;
      storyItem.appendChild(storyId);

      // Create story title/description element
      const storyTitle = document.createElement('div');
      storyTitle.classList.add('story-title');
      const tmpDiv = document.createElement('div');
      tmpDiv.innerHTML = storyText || '';
      const previewText = tmpDiv.innerText || tmpDiv.textContent || 'No description';
      storyTitle.textContent = previewText;
      storyItem.appendChild(storyTitle);

      // Add Feature tag - ADDED THIS SECTION FOR CSV STORIES TOO
      const featureTag = document.createElement('div');
      featureTag.className = 'story-feature-tag';
      featureTag.textContent = 'Feature';
      storyItem.appendChild(featureTag);

      // Story meta container (vote count + story points)
      const storyMeta = document.createElement('div');
      storyMeta.className = 'story-meta';

      // Vote count element (bottom left with people icon)
      const voteCountEl = document.createElement('div');
      voteCountEl.className = 'vote-count';
      voteCountEl.id = `vote-count-${csvStoryId}`;
      voteCountEl.textContent = '0 votes';
      storyMeta.appendChild(voteCountEl);

      // Story points element (bottom right, green)
      const storyPointsEl = document.createElement('div');
      storyPointsEl.className = 'story-points';
      storyPointsEl.id = `story-points-${csvStoryId}`;
      storyPointsEl.textContent = textContent = '?';
      
      // Add story points editing functionality
      storyPointsEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = storyPointsEl.textContent.trim();
        storyPointsEl.classList.add('editing');
  const storyItem = storyPointsEl.closest('.story-card');
  storyPointsEl.classList.add('editing');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = current === '?' ? '' : current;
        input.style.cssText = 'width: 40px; text-align: center; font-size: 12px; font-weight: 700; background: #10b981; color: white; border: none; border-radius: 6px;';
        storyPointsEl.textContent = '';
        storyPointsEl.appendChild(input);
        input.focus();
        input.select();

        commit(storyItem, input);
        input.addEventListener('blur', () => commit(storyItem, input));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            commit(storyItem, input);
          } else if (e.key === 'Escape') {
            storyPointsEl.classList.remove('editing');
            storyPointsEl.textContent = current;
          }
        });
      });

      storyMeta.appendChild(storyPointsEl);
      storyItem.appendChild(storyMeta);

      // Add 3-dot menu for hosts
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
          editStory({
            id: csvStoryId,
            idDisplay: storyItem.dataset.id,
            descriptionDisplay: storyItem.dataset.description,
            text: `${storyId.textContent}: ${storyTitle.textContent}`
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

  const storyTitle = storyCard.querySelector('.story-title');
  if (storyTitle) {
    storyTitle.textContent = newDisplay;
  }
  storyCard.dataset.id = newName;
  storyCard.dataset.description = newDesc;

  const storyObject = {
    id: ticketId,
    idDisplay: newName,
    descriptionDisplay: newDesc,
    text: newDisplay
  };

  updateTicketInUI(storyObject);

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('updateTicket', storyObject);
  }

  const modal = document.getElementById('addTicketModalCustom');
  if (modal) {
    modal.style.display = 'none';
  }

  window.currentEditingTicketId = null;
  window.editingTicketData = null;

  setTimeout(() => {
if (stories && stories.length > 0) {
  selectStory(0, false);
} else {
  console.warn("[UI] No stories available, skipping auto-select");
}
  }, 200);
}

/**
 * Select a story by index
 * @param {number} index - Story index to select
 * @param {boolean} emitToServer - Whether to emit to server (default: true)
 * @param {boolean} forceSelection - Whether to force selection even after retries
 */
function selectStory(index, emitToServer = true, forceSelection = false) {
  console.log('[UI] Story selected by user:', index, forceSelection ? '(forced)' : '');

  document.querySelectorAll('.story-card').forEach(card => {
    card.classList.remove('selected', 'active');
  });

  const storyCard = document.querySelector(`.story-card[data-index="${index}"]`);
  if (storyCard) {
    storyCard.classList.add('selected', 'active');

    currentStoryIndex = index;

    let storyId = getCurrentStoryId();

    if (storyId && deletedStoryIds.has(storyId)) {
      console.log(`[UI] Selected story ${storyId} is marked as deleted, skipping further processing`);
      return;
    }

    if (storyId && typeof votesRevealed[storyId] === 'undefined') {
      votesRevealed[storyId] = false;
    }

    const areVotesRevealed = storyId && votesRevealed[storyId] === true;
    
    // ✅ IMPROVED REVEALED STATE HANDLING
    if (areVotesRevealed) {
      console.log(`[UI] Story ${storyId} votes are revealed, hiding planning cards`);
      const planningCardsSection = document.querySelector('.planning-cards-section');
      if (planningCardsSection) {
        planningCardsSection.classList.add('hidden-until-init');
        planningCardsSection.style.display = 'none';
      }
      
      // ✅ ENSURE STATS ARE SHOWN FOR REVEALED STORIES
      setTimeout(() => {
        handleVotesRevealed(storyId, votesPerStory[storyId] || {});
      }, 100);
    } else {
      console.log(`[UI] Story ${storyId} votes are not revealed, showing planning cards`);
      const planningCardsSection = document.querySelector('.planning-cards-section');
      if (planningCardsSection) {
        planningCardsSection.classList.remove('hidden-until-init');
        planningCardsSection.style.display = 'block';
      }
      
      // ✅ HIDE ALL STATS CONTAINERS WHEN NOT REVEALED
      const allStatsContainers = document.querySelectorAll('.vote-statistics-container');
      allStatsContainers.forEach(container => {
        container.style.display = 'none';
      });
    }

    renderCurrentStory();
    resetOrRestoreVotes(storyId);

    const storyCards = document.querySelectorAll('.story-card');
    const storyCardFromList = storyCards[index];
    storyId = storyCardFromList ? storyCardFromList.id : null;

    if (emitToServer && socket) {
      console.log('[EMIT] Broadcasting story selection:', index);

      socket.emit('storySelected', { 
        storyIndex: index, 
        storyId: storyId 
      });

      if (storyId) {
        if (typeof requestStoryVotes === 'function') {
          requestStoryVotes(storyId);
        } else {
          socket.emit('requestStoryVotes', { storyId });
        }
      }
    }
  } else if (forceSelection) {
    // ... rest of forceSelection logic remains the same
    console.log(`[UI] Story card with index ${index} not found yet, retrying selection soon...`);
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
  if (!storyId || deletedStoryIds.has(storyId)) {
    return;
  }
  
  resetAllVoteVisuals();
  
  if (!votesPerStory[storyId]) {
    votesPerStory[storyId] = {};
    
    if (socket && socket.connected) {
      console.log(`[VOTE] Requesting votes for story: ${storyId}`);
      socket.emit('requestStoryVotes', { storyId });
    }
    return;
  }
  
  if (votesRevealed[storyId]) {
    applyVotesToUI(votesPerStory[storyId], false);
    
    setTimeout(() => {
      if (votesRevealed[storyId]) {
        handleVotesRevealed(storyId, votesPerStory[storyId]);
      }
    }, 100);
  } else {
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
  // **REDUCED: Less verbose logging**
  if (Object.keys(votes).length > 0) {
    console.log(`[VOTE] Applying ${Object.keys(votes).length} votes, hideValues: ${hideValues}`);
  }
  
  Object.entries(votes).forEach(([userId, vote]) => {
    updateVoteVisuals(userId, hideValues ? '👍' : vote, true);
  });

  // ✅ STORE AND UPDATE STORY POINTS WHEN VOTES ARE REVEALED
  if (!hideValues) {
    const finalPointValue = findMostCommonVote(votes);  
    const currentStoryId = getCurrentStoryId(); 
    if (currentStoryId) {
      revealedStoryPoints[currentStoryId] = finalPointValue;
      updateStoryCardPoint(currentStoryId, finalPointValue);
    }
  }
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

  // ✅ PRESERVE REVEALED STORY POINTS - don't reset if already revealed
  document.querySelectorAll('.story-points').forEach(pointsEl => {
    const storyId = pointsEl.id.replace('story-points-', '');
    if (revealedStoryPoints[storyId]) {
      // Keep the revealed value and styling
      pointsEl.textContent = revealedStoryPoints[storyId];
      pointsEl.classList.add('revealed');
    } else {
      // Only reset unrevealed story points
      pointsEl.textContent = '?';
      pointsEl.classList.remove('revealed');
    }
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

  userListContainer.innerHTML = '';
  userCircleContainer.innerHTML = '';

  const currentUserId = socket ? socket.id : null;

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

  const gridLayout = document.createElement('div');
  gridLayout.classList.add('poker-table-layout');

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
    const voteCard = createVoteCardSpace(user, currentUserId === user.id);
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
      const storyId = getCurrentStoryId();
      
      if (storyId && deletedStoryIds.has(storyId)) {
        console.log(`[VOTE] Cannot reveal votes for deleted story: ${storyId}`);
        return;
      }
      
      if (socket && storyId) {
        console.log('[UI] Revealing votes for story:', storyId);
        
        votesRevealed[storyId] = true;
        
        const votes = votesPerStory[storyId] || {};
        applyVotesToUI(votes, false);
        
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.add('hidden-until-init');
          planningCardsSection.style.display = 'none';
        }
        
        handleVotesRevealed(storyId, votes);
        updateVoteCountUI(storyId);
        
        triggerGlobalEmojiBurst();
        
        socket.emit('revealVotes', { storyId });
      } else {
        console.warn('[UI] Cannot reveal votes: No story selected');
      }
    };
  }
  
  revealButtonContainer.appendChild(revealBtn);

  const bottomVoteRow = document.createElement('div');
  bottomVoteRow.classList.add('vote-row');
  
  bottomUsers.forEach(user => {
    const voteCard = createVoteCardSpace(user, currentUserId === user.id);
    bottomVoteRow.appendChild(voteCard);
  });

  const bottomAvatarRow = document.createElement('div');
  bottomAvatarRow.classList.add('avatar-row');
  
  bottomUsers.forEach(user => {
    const avatarContainer = createAvatarContainer(user);
    bottomAvatarRow.appendChild(avatarContainer);
  });

  gridLayout.appendChild(topAvatarRow);
  gridLayout.appendChild(topVoteRow);
  gridLayout.appendChild(revealButtonContainer);
  gridLayout.appendChild(bottomVoteRow);
  gridLayout.appendChild(bottomAvatarRow);
  
  userCircleContainer.appendChild(gridLayout);
  
  if (!hasRequestedTickets && users.length > 0) {
    setTimeout(() => {
      if (socket && socket.connected) {
        console.log('[INFO] Requesting all tickets after user list update');
        socket.emit('requestAllTickets');
        hasRequestedTickets = true;
      }
    }, 500);
  }
  
  const storyId = getCurrentStoryId();
  
  if (storyId && deletedStoryIds.has(storyId)) {
    return;
  }
  
  if (storyId && votesPerStory[storyId]) {
    const votes = votesPerStory[storyId];
    const reveal = votesRevealed[storyId];
    applyVotesToUI(votes, !reveal);
    
    if (reveal) {
      setTimeout(() => {
        handleVotesRevealed(storyId, votes);
        updateVoteCountUI(storyId);
      }, 200);
    }
  }
  
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
  
  const storyId = getCurrentStoryId();
  
  if (!storyId || deletedStoryIds.has(storyId)) {
    return avatarContainer;
  }
  
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
  
  if (storyId && deletedStoryIds.has(storyId)) {
    console.log(`[VOTE] Cannot cast vote for deleted story: ${storyId}`);
    return;
  }
  
  if (socket && vote && storyId) {
    console.log(`[VOTE] Immediately showing vote feedback for host: ${vote}`);
    
    // IMMEDIATE UI UPDATE - don't wait for server response
    const voteBadge = voteCard.querySelector('.vote-badge');
    if (voteBadge) {
      // Show immediate feedback
      voteBadge.textContent = votesRevealed[storyId] ? vote : '👍';
      voteBadge.style.color = '#673ab7';
      voteBadge.style.opacity = '1';
    }
    
    // Mark as having a vote immediately
    voteCard.classList.add('has-vote');
    
    // Update avatar visual feedback immediately
    const avatarContainer = document.querySelector(`#user-circle-${user.id}`);
    if (avatarContainer) {
      avatarContainer.classList.add('has-voted');
      const avatar = avatarContainer.querySelector('.avatar-circle');
      if (avatar) {
        avatar.style.backgroundColor = '#c1e1c1';
      }
    }
    
    // Update local vote storage immediately
    if (!votesPerStory[storyId]) {
      votesPerStory[storyId] = {};
    }
    votesPerStory[storyId][user.id] = vote;
    
    // Update vote count immediately
    updateVoteCountUI(storyId);
    
    // Then emit to server (this will sync with other users)
    socket.emit('castVote', { vote, targetUserId: user.id, storyId });
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
  // **REDUCED: Less verbose logging**
  const storyId = getCurrentStoryId();
  
  if (!storyId || deletedStoryIds.has(storyId)) {
    return;
  }

  const isRevealed = votesRevealed[storyId] === true;
  const displayVote = isRevealed ? vote : '👍';

  let voteSpace = document.querySelector(`#vote-space-${userId}`);
  let sidebarBadge = document.querySelector(`#user-${userId} .vote-badge`);
  let avatarContainer = document.querySelector(`#user-circle-${userId}`);
  
  if (!voteSpace || !sidebarBadge) {
    const userName = window.userMap?.[userId] || userId;
    
    const userElements = document.querySelectorAll(`.user-name`);
    userElements.forEach(el => {
      if (el.textContent === userName) {
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

  if (sidebarBadge) {
    if (hasVoted) {
      sidebarBadge.textContent = displayVote;
      sidebarBadge.style.color = '#673ab7';
      sidebarBadge.style.opacity = '1';
    } else {
      sidebarBadge.textContent = '';
    }
  }

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
  }

  if (hasVoted && avatarContainer) {
    avatarContainer.classList.add('has-voted');
    const avatar = avatarContainer.querySelector('.avatar-circle');
    if (avatar) {
      avatar.style.backgroundColor = '#c1e1c1';
    }
  }
}

/**
 * Update story title 
 */
function updateStory(story) {
  const storyTitle = document.getElementById('currentStory');
  if (storyTitle) storyTitle.innerHTML = story;
}

/**
 * Setup story navigation
 */
function setupStoryNavigation() {
  const nextButton = document.getElementById('nextStory');
  const prevButton = document.getElementById('prevStory');

  if (!nextButton || !prevButton) return;
  
  const isHost = sessionStorage.getItem('isHost') === 'true';
  if (!isHost) {
    nextButton.disabled = true;
    prevButton.disabled = true;
    nextButton.classList.add('disabled-nav');
    prevButton.classList.add('disabled-nav');
    return;
  }
  
  nextButton.replaceWith(nextButton.cloneNode(true));
  prevButton.replaceWith(prevButton.cloneNode(true));

  const newNextButton = document.getElementById('nextStory');
  const newPrevButton = document.getElementById('prevStory');

  function getOrderedCards() {
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
    selectStory(parseInt(cards[nextIndex].dataset.index));
  });

  newPrevButton.addEventListener('click', () => {
    const cards = getOrderedCards();
    if (cards.length === 0) return;

    const currentIndex = getSelectedCardIndex();
    const prevIndex = (currentIndex - 1 + cards.length) % cards.length;

    console.log(`[NAV] Previous from ${currentIndex} → ${prevIndex}`);
    selectStory(parseInt(cards[prevIndex].dataset.index));
  });
}

/**
 * Set up story card interactions based on user role
 */
function setupStoryCardInteractions() {
  const storyCards = document.querySelectorAll('.story-card');

  storyCards.forEach(card => {
    const isGuest = isGuestUser();

    if (isGuest) {
      card.classList.add('disabled-story');

      const actionsContainer = card.querySelector('.story-actions');
      if (!actionsContainer) {
        const newCard = card.cloneNode(true);
        if (card.parentNode) {
          card.parentNode.replaceChild(newCard, card);
        }
      }
    } else {
      if (isCurrentUserHost()) {
        const actionsContainer = card.querySelector('.story-actions');

        if (actionsContainer && typeof(actionsContainer) != undefined) {
          const menuBtn = actionsContainer.querySelector('.story-menu-btn');
          const dropdown = actionsContainer.querySelector('.story-menu-dropdown');
          const editItem = dropdown.querySelector('.story-menu-item.edit');
          const deleteItem = dropdown.querySelector('.story-menu-item.delete');

          if(menuBtn) {
            if (!menuBtn.hasAttribute('data-listener-added')) {
              console.log('Adding click handler to 3-dot menu (Host): ' + card.id);
              menuBtn.setAttribute('data-listener-added', 'true');

              menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.story-menu-dropdown.show').forEach(dd => {
                  if (dd !== dropdown) dd.classList.remove('show');
                });

                dropdown.classList.toggle('show');
              });
            }
          }

          if(editItem && menuBtn) {
            if (!editItem.hasAttribute('data-listener-added')) {
              editItem.setAttribute('data-listener-added', 'true');

              editItem.addEventListener('click', (e) => {
                if(typeof(menuBtn) != undefined && menuBtn != null){
                  e.stopPropagation();
                  dropdown.classList.remove('show');

                  const storyId = card.id;
                  const text = card.querySelector('.story-title').textContent;
                  if (window.editStory && typeof window.editStory === 'function') {
                    window.editStory({ id: storyId, text: text });
                    e.preventDefault();

                    console.log("Edit " + storyId + " Click event to select id for edit");
                  }
                }
              });
            }
          }

          if(deleteItem && menuBtn) {
            if (!deleteItem.hasAttribute('data-listener-added')) {
              deleteItem.setAttribute('data-listener-added', 'true');

              deleteItem.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                var cardDetails = " The delete item clicked for = " + storyId + " Card ID= " + card.className
                console.log(cardDetails)

                let finalId = card.id;
                deleteStory(finalId);
              });
            }
          }
        }
      }
    }
  })
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
    if (typeof window.showInviteModalCustom === 'function') {
      window.showInviteModalCustom();
    } else if (typeof showInviteModalCustom === 'function') {
      showInviteModalCustom();
    } else {
      const currentUrl = new URL(window.location.href);
      const params = new URLSearchParams(currentUrl.search);
      const roomId = params.get('roomId') || getRoomIdFromURL();
      
      const guestUrl = `${currentUrl.origin}${currentUrl.pathname}?roomId=${roomId}`;
      
      alert(`Share this invite link: ${guestUrl}`);
    }
  };
}

/**
 * Setup vote cards drag functionality
 */
function setupVoteCardsDrag() {
  // Make cards draggable
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.textContent.trim());
    });

    // Existing click handler for immediate vote
    card.addEventListener('click', (e) => {
      const vote = card.textContent.trim();
      const storyId = getCurrentStoryId();
      const currentUserId = socket ? socket.id : null;

      if (storyId && currentUserId && !deletedStoryIds.has(storyId)) {
        // Immediate local UI update
        if (!votesPerStory[storyId]) {
          votesPerStory[storyId] = {};
        }
        votesPerStory[storyId][currentUserId] = vote;
        const displayVote = votesRevealed[storyId] ? vote : '👍';
        updateVoteVisuals(currentUserId, displayVote, true);
        updateVoteCountUI(storyId);

        // Emit to server
        socket.emit('restoreUserVoteByUsername', {
          storyId,
          vote,
          userName: sessionStorage.getItem('userName') || currentUserId
        });
      }
    });
  });

  // ✅ New drop handler for drag-and-drop voting
  document.querySelectorAll('.vote-card-space').forEach(space => {
    space.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    space.addEventListener('drop', (e) => {
      e.preventDefault();
      const vote = e.dataTransfer.getData('text/plain').trim();
      const storyId = getCurrentStoryId();
      const currentUserId = socket ? socket.id : null;

      if (storyId && currentUserId && !deletedStoryIds.has(storyId)) {
        // Immediate local UI update
        if (!votesPerStory[storyId]) {
          votesPerStory[storyId] = {};
        }
        votesPerStory[storyId][currentUserId] = vote;
        const displayVote = votesRevealed[storyId] ? vote : '👍';
        updateVoteVisuals(currentUserId, displayVote, true);
        updateVoteCountUI(storyId);

        // Emit to server immediately
        socket.emit('restoreUserVoteByUsername', {
          storyId,
          vote,
          userName: sessionStorage.getItem('userName') || currentUserId
        });
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

    burst.style.left = `${Math.random() * 100}vw`;
    burst.style.top = `${Math.random() * 100}vh`;

    container.appendChild(burst);

    setTimeout(() => {
      burst.classList.add('burst-go');
    }, 10);

    setTimeout(() => {
      burst.remove();
    }, 1200);
  }
}
/**
 * Handle socket messages with improved state persistence
 */
async function handleSocketMessage(message) {
  const eventType = message.type;
  
  switch(eventType) {
    case 'userList':
      if (Array.isArray(message.users)) {
        updateUserList(message.users);
      }
      break;

    case 'addTicket':
      if (message.ticketData) {
        if (deletedStoryIds.has(message.ticketData.id)) {
          console.log('[TICKET] Ignoring deleted ticket:', message.ticketData.id);
          return;
        }
        
        console.log('[SOCKET] New ticket received:', message.ticketData);
        addTicketToUI(message.ticketData, false);
        applyGuestRestrictions();
      }
      break;
      
    case 'votingSystemUpdate':
      console.log('[DEBUG] Got voting system update:', message.votingSystem);
      sessionStorage.setItem('votingSystem', message.votingSystem);
      setupPlanningCards();
      break;

case 'storyPointsUpdate':

    console.log('[SOCKET] Processing storyPointsUpdate message:', message);

    const storyPointsEl = document.getElementById(`story-points-${message.storyId}`);
    if (storyPointsEl) {
        const isCurrentlyEditing = storyPointsEl.classList.contains('editing');
        if (!isCurrentlyEditing) {
            const oldValue = storyPointsEl.textContent;
            storyPointsEl.textContent = message.points;
            console.log(`[SOCKET] Updated story points display: ${message.storyId} from "${oldValue}" to "${message.points}"`);
        } else {
            console.log(`[SOCKET] Skipping update - element is being edited by current user`);
        }
    } else {
        console.warn(`[SOCKET] Could not find story points element: story-points-${message.storyId}`);

        const allPointsElements = document.querySelectorAll('[id^="story-points-"]');
        console.log(`[SOCKET] Available story-points elements:`, Array.from(allPointsElements).map(el => el.id));
    }


  const storyCard = document.getElementById(message.storyId);
  if (storyCard) {
    storyCard.dataset.storyPoints = message.points;
  }  

  // Send acknowledgement to server
  if (socket) {
    socket.emit('ack', {type: 'storyPointsUpdate', storyId: message.storyId});
  }

  break;

    case 'resyncState':
      if (Array.isArray(message.deletedStoryIds)) {
        message.deletedStoryIds.forEach(id => {
          if (!deletedStoryIds.has(id)) {
            deletedStoryIds.add(id);
          }
        });
        
        const roomId = getRoomIdFromURL();
        saveDeletedStoriesToStorage(roomId);
      }
      
      const filteredTickets = (message.tickets || []).filter(ticket => 
        !deletedStoryIds.has(ticket.id)
      );
      await translateTicketsIfNeeded(filteredTickets);
      processAllTickets(filteredTickets);
      
      if (message.votesPerStory) {
        for (const [storyId, votes] of Object.entries(message.votesPerStory)) {
          if (deletedStoryIds.has(storyId)) continue;
          
          if (!votesPerStory[storyId]) {
            votesPerStory[storyId] = {};
          }
          
          votesPerStory[storyId] = { ...votes };
          window.currentVotesPerStory = votesPerStory;
        }
      }
      
      if (message.votesRevealed) {
        for (const storyId in message.votesRevealed) {
          if (deletedStoryIds.has(storyId)) continue;
          
          votesRevealed[storyId] = message.votesRevealed[storyId];
          
          const currentId = getCurrentStoryId();
          if (votesRevealed[storyId] && storyId === currentId) {
            const storyVotes = votesPerStory[storyId] || {};
            applyVotesToUI(storyVotes, false);
            handleVotesRevealed(storyId, storyVotes);
          }
        }
      }
      
      const currentStoryId = getCurrentStoryId();
      if (currentStoryId && socket && socket.connected) {
        setTimeout(() => {
          socket.emit('requestStoryVotes', { storyId: currentStoryId });
        }, 300);
      }
      break;

    case 'updateTicket':
      if (message.ticketData) {
        console.log('[SOCKET] Ticket updated by another user:', message.ticketData);
        updateTicketInUI(message.ticketData);
      }
      break;

    case 'restoreUserVote':
      if (message.storyId && message.vote) {
        if (deletedStoryIds.has(message.storyId)) {
          console.log(`[VOTE] Ignoring vote restoration for deleted story: ${message.storyId}`);
          return;
        }
        
        const currentUserId = socket.id;
        
        if (!votesPerStory[message.storyId]) {
          votesPerStory[message.storyId] = {};
        }
        votesPerStory[message.storyId][currentUserId] = message.vote;
        
        const currentId = getCurrentStoryId();
        if (message.storyId === currentId) {
          updateVoteVisuals(currentUserId, votesRevealed[message.storyId] ? message.vote : '👍', true);
        }
        
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
      if (Array.isArray(message.tickets)) {
        const filteredTickets = message.tickets.filter(ticket => !deletedStoryIds.has(ticket.id));
        console.log(`[SOCKET] Received ${filteredTickets.length} valid tickets (filtered from ${message.tickets.length})`);
        processAllTickets(filteredTickets);
        applyGuestRestrictions();
      }
      break;
      
    case 'userJoined':
      break;
      
    case 'userLeft':
      break;
      
    case 'voteReceived':
    case 'voteUpdate':
      if (message.storyId && deletedStoryIds.has(message.storyId)) {
        console.log(`[VOTE] Ignoring vote for deleted story: ${message.storyId}`);
        return;
      }
      
      if (message.userId && message.vote) {
        if (!votesPerStory[message.storyId]) {
          votesPerStory[message.storyId] = {};
        }
        votesPerStory[message.storyId][message.userId] = message.vote;
        
        const currentStoryId = getCurrentStoryId();
        if (message.storyId === currentStoryId) {
          updateVoteVisuals(message.userId, votesRevealed[message.storyId] ? message.vote : '👍', true);
        }
        
        // **FIXED: Update vote count bubble after vote**
        updateVoteCountUI(message.storyId);
      }
      break;
      
    case 'deleteStory':
      if (message.storyId) {
        console.log('[SOCKET] Story deletion received for ID:', message.storyId);
        
        deletedStoryIds.add(message.storyId);
        
        const roomId = getRoomIdFromURL();
        saveDeletedStoriesToStorage(roomId);
        
        const storyCard = document.getElementById(message.storyId);
        if (storyCard) {
          const index = parseInt(storyCard.dataset.index);
          
          console.log(`[SOCKET] Removing story card ${message.storyId} from DOM`);
          storyCard.remove();
          
          normalizeStoryIndexes();
          
          if (index === currentStoryIndex) {
            const storyList = document.getElementById('storyList');
            if (storyList && storyList.children.length > 0) {
              const newIndex = Math.min(index, storyList.children.length - 1);
              selectStory(newIndex, false);
            }
          }
          setupStoryCardInteractions();
        } else {
          console.warn(`[SOCKET] Could not find story card ${message.storyId} to delete`);
        }
        
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
      
      if (message.storyId && deletedStoryIds.has(message.storyId)) {
        console.log(`[VOTE] Ignoring vote reveal for deleted story: ${message.storyId}`);
        return;
      }
      
      const storyId = message.storyId;
      
      if (storyId) {
        if (votesRevealed[storyId] === true) {
          console.log(`[VOTE] Votes already revealed for story ${storyId}, not triggering effects again`);
          return;
        }
        
        votesRevealed[storyId] = true;
        console.log(`[DEBUG] Set votesRevealed[${storyId}] = true`);
        
        const votes = votesPerStory[storyId] || {};
        console.log(`[DEBUG] Votes for story ${storyId}:`, JSON.stringify(votes));
        
        applyVotesToUI(votes, false);
        
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.add('hidden-until-init');
          planningCardsSection.style.display = 'none';
        }
        
        handleVotesRevealed(storyId, votes);
        updateVoteCountUI(storyId);
        
        triggerGlobalEmojiBurst();
        
        console.log(`[VOTE] Votes revealed for story: ${storyId}, stats should now be visible`);
      }
      break;
      
case 'votesReset':
  if (message.storyId && deletedStoryIds.has(message.storyId)) {
    console.log(`[VOTE] Ignoring vote reset for deleted story: ${message.storyId}`);
    return;
  }
  
  if (message.storyId) {
    if (votesPerStory[message.storyId]) {
      votesPerStory[message.storyId] = {};
    }
    
    votesRevealed[message.storyId] = false;
    
    // ✅ CLEAR THE REVEALED STORY POINTS
    if (revealedStoryPoints[message.storyId]) {
      delete revealedStoryPoints[message.storyId];
    }
    
    const planningCardsSection = document.querySelector('.planning-cards-section');
    if (planningCardsSection) {
      planningCardsSection.classList.remove('hidden-until-init');
      planningCardsSection.style.display = 'block';
    }
    
    const statsContainers = document.querySelectorAll(`.vote-statistics-container[data-story-id="${message.storyId}"]`);
    statsContainers.forEach(container => {
      container.style.display = 'none';
    });
    
    const currentId = getCurrentStoryId();
    if (message.storyId === currentId) {
      resetAllVoteVisuals();
    }
    
    updateVoteCountUI(message.storyId);
    
    console.log(`[VOTE] Votes reset for story: ${message.storyId}, planning cards should now be visible`);
  }
  break;
      
case 'storySelected':
  if (typeof message.storyIndex === 'number') {
    console.log('[SOCKET] Story selected from server:', message.storyIndex);
    
    const forceSelection = message.forceSelection === true;
    
    selectStory(message.storyIndex, false, forceSelection);
    
    // ✅ IMPROVED STATE HANDLING AFTER STORY SELECTION
    const currentStoryId = getCurrentStoryId();
    if (currentStoryId) {
      const isRevealed = votesRevealed[currentStoryId];
      
      if (isRevealed) {
        console.log(`[SOCKET] Selected story ${currentStoryId} is revealed, ensuring proper state`);
        // Hide planning cards and show stats
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.add('hidden-until-init');
          planningCardsSection.style.display = 'none';
        }
        
        // Show stats after a small delay to ensure DOM is ready
        setTimeout(() => {
          if (votesPerStory[currentStoryId]) {
            handleVotesRevealed(currentStoryId, votesPerStory[currentStoryId]);
          }
        }, 100);
      } else {
        console.log(`[SOCKET] Selected story ${currentStoryId} is not revealed, showing planning cards`);
        // Show planning cards and hide stats
        const planningCardsSection = document.querySelector('.planning-cards-section');
        if (planningCardsSection) {
          planningCardsSection.classList.remove('hidden-until-init');
          planningCardsSection.style.display = 'block';
        }
        
        const allStatsContainers = document.querySelectorAll('.vote-statistics-container');
        allStatsContainers.forEach(container => {
          container.style.display = 'none';
        });
      }
      
      // Request votes for the newly selected story
      if (socket && socket.connected && !deletedStoryIds.has(currentStoryId)) {
        setTimeout(() => {
          socket.emit('requestStoryVotes', { storyId: currentStoryId });
        }, 100);
      }
    }
  }
  break;
      
      
    case 'storyVotes':
      if (message.storyId && deletedStoryIds.has(message.storyId)) {
        console.log(`[VOTE] Ignoring votes for deleted story: ${message.storyId}`);
        return;
      }
      
      if (message.storyId !== undefined && message.votes) {
        if (!votesPerStory[message.storyId]) {
          votesPerStory[message.storyId] = {};
        }
        
        Object.assign(votesPerStory[message.storyId], message.votes);
        
        const currentId = getCurrentStoryId();
        if (message.storyId === currentId) {
          if (votesRevealed[message.storyId]) {
            applyVotesToUI(message.votes, false);
            handleVotesRevealed(message.storyId, votesPerStory[message.storyId]);
          } else {
            applyVotesToUI(message.votes, true);
          }
        }
        
        // **FIXED: Update vote count bubble when story votes received**
        updateVoteCountUI(message.storyId);
      }
      break;
      
    case 'syncCSVData':
      if (Array.isArray(message.csvData)) {
        console.log('[SOCKET] Received CSV data, length:', message.csvData.length);
        
        csvData = message.csvData;
        csvDataLoaded = true;
        
        const storyList = document.getElementById('storyList');
        const manualTickets = [];
        
        if (storyList) {
          const manualStoryCards = storyList.querySelectorAll('.story-card[id^="story_"]:not([id^="story_csv_"])');
          manualStoryCards.forEach(card => {
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
        
        displayCSVData(csvData);
        
        renderCurrentStory();
      }
      break;

    case 'connect':
      updateConnectionStatus('connected');
      
      setTimeout(() => {
        if (socket && socket.connected) {
          if (!hasRequestedTickets) {
            console.log('[SOCKET] Connected, requesting all tickets');
            socket.emit('requestAllTickets');
            hasRequestedTickets = true;
          }
          
          const currentId = getCurrentStoryId();
          if (currentId && !deletedStoryIds.has(currentId)) {
            socket.emit('requestStoryVotes', { storyId: currentId });
          }
        }
      }, 500);
      break;
      
    case 'reconnect_attempt':
      updateConnectionStatus('reconnecting');
      reconnectingInProgress = true;
      break;
      
    case 'reconnect':
      updateConnectionStatus('connected');
      reconnectingInProgress = false;
      
      setTimeout(() => {
        if (socket && socket.connected) {
          const currentId = getCurrentStoryId();
          if (currentId && !deletedStoryIds.has(currentId)) {
            socket.emit('requestStoryVotes', { storyId: currentId });
          }
          
          if (!hasRequestedTickets) {
            socket.emit('requestAllTickets');
            hasRequestedTickets = true;
          }
          
          socket.emit('requestFullStateResync');
        }
      }, 500);
      break;
      
    case 'error':
      updateConnectionStatus('error');
      break;
      
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

// **FIXED: Centralize and stabilize vote bubble handling**
// Ensures exactly one vote bubble per .story-card
// Moves the bubble under the 3-dot menu (.story-actions)
// Updates bubble count in real-time from vote events
// Listens for reveal events and updates bubble accordingly


  // **FIXED: ensureVoteBubbleForCard function**
  function ensureVoteBubbleForCard(storyCard) {
    if (!storyCard) return null;
    const storyId = storyCard.id || storyCard.getAttribute('data-id') || storyCard.dataset.id;
    if (!storyId) return null;

    // Find or create story-actions container (3-dot menu container)
    let actions = storyCard.querySelector('.story-actions');
    if (!actions) {
      // create container to host menu and bubble if missing
      actions = document.createElement('div');
      actions.className = 'story-actions';
      // place it as first child so it's visually at top-right
      storyCard.style.position = storyCard.style.position || 'relative';
      storyCard.insertBefore(actions, storyCard.firstChild);
    }

    // Remove any duplicate standardized bubble inside this actions
    const existingStandard = actions.querySelector('.vote-bubble-standard');
    if (existingStandard) {
      // ensure id matches
      existingStandard.id = `vote-bubble-${storyId}`;
      return existingStandard;
    }

    // Remove any legacy .vote-bubble children in the card to avoid duplicates
    const legacyBubbles = storyCard.querySelectorAll('.vote-bubble');
    legacyBubbles.forEach(b => b.remove());

    // Create a single standardized bubble
    const bubble = document.createElement('div');
    bubble.className = 'vote-bubble-standard';
    bubble.id = `vote-bubble-${storyId}`;
    bubble.textContent = '?'; // default to question mark until votes start coming in
    bubble.setAttribute('aria-label', 'vote count');
    actions.appendChild(bubble);
    return bubble;
  }

  // Create/refresh bubbles for all existing story cards on init
  function initAllBubbles() {
    document.querySelectorAll('.story-card').forEach(card => ensureVoteBubbleForCard(card));
  }

  // MutationObserver to handle dynamically added/updated story cards
  const storyList = document.getElementById('storyList') || document.querySelector('.story-container') || document.body;
  if (storyList) {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.classList && node.classList.contains('story-card')) {
              ensureVoteBubbleForCard(node);
            } else if (node.querySelectorAll) {
              // in case a wrapper was inserted
              node.querySelectorAll('.story-card').forEach(card => ensureVoteBubbleForCard(card));
            }
          });
        }
      }
    });
    mo.observe(storyList, { childList: true, subtree: true });
  }

  // Helper to get current vote count for a storyId from the in-memory structure
  function getVoteCountForStory(storyId) {
    try {
      const votesObj = window.currentVotesPerStory?.[storyId] || {};
      return Object.keys(votesObj).length;
    } catch (e) {
      return 0;
    }
  }

  // Update bubble display for a story: shows '?' before reveal, count after reveal
  function updateVoteCountBubble(storyId) {
    if (!storyId) return;
    const bubble = document.getElementById(`vote-bubble-${storyId}`);
    if (!bubble) return;
    let count = 0;
    if (window.currentVotesPerStory && window.currentVotesPerStory[storyId]) {
        count = Object.keys(window.currentVotesPerStory[storyId]).length;
    }
    bubble.textContent = count;
}; 



function updateStoryPointsBubble(storyId, points) {
    if (!storyId) return;
    const bubble = document.getElementById(`points-bubble-${storyId}`);
    if (!bubble) return;
    bubble.textContent = points !== undefined && points !== null ? points : '';
}

function setupTicketSearch() {
  const searchInput = document.getElementById("ticketSearch");
  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    const query = searchInput.value.trim().toLowerCase();
    const tickets = document.querySelectorAll(".story-card");

    tickets.forEach(ticket => {
      const titleEl = ticket.querySelector(".story-title");
      const descEl  = ticket.querySelector(".story-description"); 
      const keyEl   = ticket.querySelector(".story-key"); 

      const titleText = titleEl ? titleEl.textContent.trim().toLowerCase() : "";
      const descText  = descEl ? descEl.textContent.trim().toLowerCase() : "";
      const keyText   = keyEl ? keyEl.textContent.trim().toLowerCase() : "";
      const idText    = ticket.getAttribute("data-id") 
                        ? ticket.getAttribute("data-id").trim().toLowerCase() 
                        : "";

      // Show if query matches ANY field (including ID)
      if (
        titleText.includes(query) ||
        descText.includes(query) ||
        keyText.includes(query) ||
        idText.includes(query)     // ✅ search by ID
      ) {
        ticket.style.display = "";
      } else {
        ticket.style.display = "none";
      }
    });
  });
}

// call it when DOM is ready
document.addEventListener("DOMContentLoaded", setupTicketSearch);

// also call it whenever stories are updated (main.js already has notifyStoriesUpdated)
window.notifyStoriesUpdated = function() {
  console.log("Stories updated, search still active.");
  setupTicketSearch();
};


// call it when DOM is ready
document.addEventListener("DOMContentLoaded", setupTicketSearch);

// also call it whenever stories are updated (main.js already has notifyStoriesUpdated)
window.notifyStoriesUpdated = function() {
  // existing code...
  console.log("Stories updated, search still active.");
  setupTicketSearch(); // ensure search is wired up
};

function setupFilterButton() {
  const filterBtn = document.getElementById("filterBtn");
  const searchInput = document.getElementById("ticketSearch");
  if (!filterBtn || !searchInput) return;

  filterBtn.addEventListener("click", function () {
    searchInput.value = "";
    const tickets = document.querySelectorAll(".story-card");
    tickets.forEach(ticket => ticket.style.display = "");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTicketSearch();
  setupFilterButton();
});


// ===================== Export CSV Modal Handling ===================== //
const exportCsvModal = document.getElementById("exportCsvModal");
const exportCsvBtn = document.getElementById("exportCsvBtn"); // Assuming button exists
const exportCsvCancelBtn = exportCsvModal.querySelector(".cancel-btn");
const exportCsvConfirmBtn = exportCsvModal.querySelector(".confirm-btn");
const csvPreview = document.getElementById("csvPreview");

if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", () => {
    exportCsvModal.style.display = "flex";
    generateCsvPreview();
  });
}

if (exportCsvCancelBtn) {
  exportCsvCancelBtn.addEventListener("click", () => {
    exportCsvModal.style.display = "none";
  });
}

// Close modal if clicking outside content
exportCsvModal.addEventListener("click", (e) => {
  if (e.target === exportCsvModal) {
    exportCsvModal.style.display = "none";
  }
});

// Function to generate preview
function generateCsvPreview() {
  let stories = getAllStories(); // Assuming you have a function that returns stories
  if (!stories || stories.length === 0) {
    csvPreview.textContent = "No stories available to export.";
    return;
  }

  const includeHeader = document.getElementById("csvHeaderRow").checked;
  const onlyRevealed = document.getElementById("csvOnlyRevealed").checked;
  const detailedVotes = document.getElementById("csvDetailedVotes").checked;

  let rows = [];

  if (includeHeader) {
    rows.push(["Story ID", "Title", "Points", "Vote Count", "Average"].join(","));
  }

  stories.forEach(story => {
    if (onlyRevealed && !story.revealed) return;
    let row = [
      story.id || "",
      story.title || "",
      story.points || "",
      story.votes ? story.votes.length : 0,
      story.average || ""
    ];
    rows.push(row.join(","));

    if (detailedVotes && story.votes) {
      story.votes.forEach(v => {
        rows.push([story.id, story.title, "Vote", v].join(","));
      });
    }
  });

  csvPreview.textContent = rows.join("\n");
}

// Confirm export
if (exportCsvConfirmBtn) {
  exportCsvConfirmBtn.addEventListener("click", () => {
    let csvContent = csvPreview.textContent;
    if (!csvContent.trim()) {
      alert("No CSV data to export.");
      return;
    }

    let blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "stories_export.csv";
    link.click();

    exportCsvModal.style.display = "none";
  });
}


function generateImportPreview(headers, rows) {
  const previewEl = document.getElementById("importPreview");
  if (!previewEl) return;
  let html = "<table border='1' cellspacing='0' cellpadding='4' style='border-collapse:collapse; width:100%;'>";
  html += "<thead><tr>";
  headers.forEach(h => { html += `<th style='background:#f0f0f0;'>${h}</th>`; });
  html += "</tr></thead><tbody>";
  rows.slice(0, 5).forEach(r => {
    html += "<tr>" + r.map(c => `<td>${c}</td>`).join("") + "</tr>";
  });
  html += "</tbody></table>";
  previewEl.innerHTML = html;
}
