/**
 * JIRA Integration Module
 * Handles all JIRA-related functionality for importing stories
 */

// JIRA Integration Variables
let jiraConnection = null;
let jiraStories = [];
let selectedJiraStories = new Set();

// JIRA Modal Functions
function showJiraImportModal() {
  document.getElementById('jiraImportModal').style.display = 'flex';
  document.getElementById('jiraConnectionStep').classList.add('active');
  document.getElementById('jiraSelectionStep').classList.remove('active');
  
  // Load saved JIRA credentials if available
  loadSavedJiraCredentials();
}

function hideJiraImportModal() {
  document.getElementById('jiraImportModal').style.display = 'none';
  resetJiraModal();
}

function backToJiraConnection() {
  document.getElementById('jiraConnectionStep').classList.add('active');
  document.getElementById('jiraSelectionStep').classList.remove('active');
}

function resetJiraModal() {
  document.getElementById('jiraConnectionStep').classList.add('active');
  document.getElementById('jiraSelectionStep').classList.remove('active');
  document.getElementById('jiraConnectionStatus').style.display = 'none';
  document.getElementById('proceedToStories').disabled = true;
  selectedJiraStories.clear();
  jiraStories = [];
}

// Load saved credentials from localStorage
function loadSavedJiraCredentials() {
  const savedCreds = localStorage.getItem('jiraCredentials');
  if (savedCreds) {
    try {
      const creds = JSON.parse(savedCreds);
      document.getElementById('jiraUrl').value = creds.url || '';
      document.getElementById('jiraEmail').value = creds.email || '';
      document.getElementById('jiraProject').value = creds.project || '';
      // Don't save the token for security
    } catch (e) {
      console.warn('Error loading saved JIRA credentials:', e);
    }
  }
}

// Save credentials to localStorage (excluding token)
function saveJiraCredentials() {
  const creds = {
    url: document.getElementById('jiraUrl').value,
    email: document.getElementById('jiraEmail').value,
    project: document.getElementById('jiraProject').value
  };
  localStorage.setItem('jiraCredentials', JSON.stringify(creds));
}

// Test JIRA Connection
async function testJiraConnection() {
  const url = document.getElementById('jiraUrl').value.trim();
  const email = document.getElementById('jiraEmail').value.trim();
  const token = document.getElementById('jiraToken').value.trim();
  const project = document.getElementById('jiraProject').value.trim();
  
  if (!url || !email || !token || !project) {
    showConnectionStatus('error', 'Please fill in all fields');
    return false;
  }
  
  showConnectionStatus('loading', 'Testing connection...');
  
  try {
    const response = await fetch('/api/jira/test-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, email, token, project })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      showConnectionStatus('success', `Connected successfully! Found ${result.projectName} project`);
      document.getElementById('proceedToStories').disabled = false;
      saveJiraCredentials();
      jiraConnection = { url, email, token, project };
      return true;
    } else {
      showConnectionStatus('error', result.error || 'Connection failed');
      return false;
    }
  } catch (error) {
    console.error('JIRA connection test failed:', error);
    showConnectionStatus('error', 'Connection failed. Please check your credentials.');
    return false;
  }
}

// Show connection status
function showConnectionStatus(type, message) {
  const statusEl = document.getElementById('jiraConnectionStatus');
  const statusText = statusEl.querySelector('.status-text');
  
  statusEl.className = `connection-status-indicator ${type}`;
  statusEl.style.display = 'block';
  
  if (statusText) {
    statusText.textContent = message;
  } else {
    statusEl.innerHTML = `<span class="status-text">${message}</span>`;
  }
}

// Load JIRA Stories
async function loadJiraStories() {
  if (!jiraConnection) {
    showConnectionStatus('error', 'No active JIRA connection');
    return;
  }
  
  showJiraLoadingIndicator(true);
  
  try {
    const response = await fetch('/api/jira/get-stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jiraConnection)
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      jiraStories = result.stories || [];
      displayJiraStories(jiraStories);
      
      // Switch to story selection step
      document.getElementById('jiraConnectionStep').classList.remove('active');
      document.getElementById('jiraSelectionStep').classList.add('active');
    } else {
      showConnectionStatus('error', result.error || 'Failed to load stories');
    }
  } catch (error) {
    console.error('Failed to load JIRA stories:', error);
    showConnectionStatus('error', 'Failed to load stories');
  } finally {
    showJiraLoadingIndicator(false);
  }
}

// Display JIRA Stories
function displayJiraStories(stories) {
  const container = document.getElementById('jiraStoriesList');
  container.innerHTML = '';
  
  if (!stories || stories.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No stories found in this project.</p>';
    return;
  }
  
  stories.forEach(story => {
    const storyElement = createJiraStoryElement(story);
    container.appendChild(storyElement);
  });
  
  updateSelectedCount();
}

// Create JIRA Story Element
function createJiraStoryElement(story) {
  const div = document.createElement('div');
  div.className = 'jira-story-item';
  div.dataset.storyKey = story.key;
  
  const typeIcon = getJiraTypeIcon(story.issueType);
  const statusColor = getJiraStatusColor(story.status);
  const priorityIcon = getJiraPriorityIcon(story.priority);
  
  div.innerHTML = `
    <input type="checkbox" class="jira-story-checkbox" data-story-key="${story.key}">
    <div class="jira-story-content">
      <div class="jira-story-key">${story.key}</div>
      <div class="jira-story-summary">${story.summary}</div>
      <div class="jira-story-meta">
        <div class="jira-story-type">
          <span class="jira-type-icon" style="background: ${typeIcon.color}">${typeIcon.emoji}</span>
          ${story.issueType}
        </div>
        <div class="jira-story-status">
          <span class="jira-status-icon" style="background: ${statusColor}"></span>
          ${story.status}
        </div>
        <div class="jira-story-priority">
          <span class="jira-priority-icon">${priorityIcon}</span>
          ${story.priority}
        </div>
        ${story.assignee ? `<div>👤 ${story.assignee}</div>` : ''}
        ${story.storyPoints ? `<div>📊 ${story.storyPoints} pts</div>` : ''}
      </div>
    </div>
  `;
  
  // Add click handlers
  const checkbox = div.querySelector('.jira-story-checkbox');
  
  div.addEventListener('click', (e) => {
    if (e.target !== checkbox) {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    }
  });
  
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedJiraStories.add(story.key);
      div.classList.add('selected');
    } else {
      selectedJiraStories.delete(story.key);
      div.classList.remove('selected');
    }
    updateSelectedCount();
  });
  
  return div;
}

// Helper functions for JIRA story styling
function getJiraTypeIcon(issueType) {
  const types = {
    'Story': { emoji: '📖', color: '#65ba43' },
    'Bug': { emoji: '🐛', color: '#e97f33' },
    'Task': { emoji: '✅', color: '#4a90e2' },
    'Epic': { emoji: '🚀', color: '#8b5cf6' },
    'Sub-task': { emoji: '📝', color: '#6b7280' }
  };
  return types[issueType] || { emoji: '📋', color: '#9ca3af' };
}

function getJiraStatusColor(status) {
  const colors = {
    'To Do': '#6b7280',
    'In Progress': '#3b82f6',
    'Ready for Review': '#f59e0b',
    'Done': '#10b981',
    'Cancelled': '#ef4444'
  };
  return colors[status] || '#9ca3af';
}

function getJiraPriorityIcon(priority) {
  const icons = {
    'Highest': '🔴',
    'High': '🟠',
    'Medium': '🟡',
    'Low': '🟢',
    'Lowest': '🔵'
  };
  return icons[priority] || '⚪';
}

// Update selected count
function updateSelectedCount() {
  const count = selectedJiraStories.size;
  document.getElementById('selectedCount').textContent = `${count} selected`;
  document.getElementById('importSelectedStories').disabled = count === 0;
}

// Show/hide loading indicator
function showJiraLoadingIndicator(show) {
  const indicator = document.getElementById('jiraLoadingIndicator');
  const storiesList = document.getElementById('jiraStoriesList');
  
  if (show) {
    indicator.style.display = 'block';
    storiesList.style.display = 'none';
  } else {
    indicator.style.display = 'none';
    storiesList.style.display = 'block';
  }
}

// Filter JIRA Stories
function filterJiraStories() {
  const statusFilter = document.getElementById('jiraStatusFilter').value;
  const typeFilter = document.getElementById('jiraTypeFilter').value;
  const searchFilter = document.getElementById('jiraSearchInput').value.toLowerCase();
  
  let filteredStories = jiraStories.filter(story => {
    const matchesStatus = !statusFilter || story.status === statusFilter;
    const matchesType = !typeFilter || story.issueType === typeFilter;
    const matchesSearch = !searchFilter || 
      story.key.toLowerCase().includes(searchFilter) ||
      story.summary.toLowerCase().includes(searchFilter);
    
    return matchesStatus && matchesType && matchesSearch;
  });
  
  displayJiraStories(filteredStories);
}

// Import Selected Stories
async function importSelectedStories() {
  if (selectedJiraStories.size === 0) return;
  
  const selectedStoryData = jiraStories.filter(story => 
    selectedJiraStories.has(story.key)
  );
  
  console.log('[JIRA] Importing', selectedStoryData.length, 'stories');
  
  // Import each selected story
  for (const story of selectedStoryData) {
    const ticketData = {
      id: `story_jira_${story.key}_${Date.now()}`,
      text: `${story.key}: ${story.summary}`,
      idDisplay: story.key,
      descriptionDisplay: story.description || story.summary,
      originalText: `${story.key}: ${story.summary}`,
      originalLang: 'en',
      source: 'jira',
      jiraData: {
        key: story.key,
        issueType: story.issueType,
        status: story.status,
        priority: story.priority,
        assignee: story.assignee,
        storyPoints: story.storyPoints
      }
    };
    
    // Add to UI using the main app function
    if (typeof window.addTicketFromModal === 'function') {
      window.addTicketFromModal(ticketData);
    } else if (typeof addTicketToUI === 'function') {
      addTicketToUI(ticketData, false);
    }
    
    // Emit to server if socket is available
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('addTicket', ticketData);
    }
  }
  
  hideJiraImportModal();
  
  // Show success message
  alert(`Successfully imported ${selectedStoryData.length} stories from JIRA!`);
}

// Initialize JIRA Integration
function initializeJiraIntegration() {
  console.log('[JIRA] Initializing JIRA integration module');
  
  // Add JIRA Import menu option to profile menu
  const uploadBtn = document.getElementById('uploadTicketMenuBtn');
  if (uploadBtn && uploadBtn.parentNode) {
    const jiraImportBtn = document.createElement('button');
    jiraImportBtn.className = 'profile-menu-item';
    jiraImportBtn.id = 'jiraImportMenuBtn';
    jiraImportBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="menu-icon">
        <path d="M11.53 2c0 2.4 1.97 4.37 4.37 4.37h.1v.1c0 2.4 1.97 4.37 4.37 4.37V2H11.53zM2 11.53c2.4 0 4.37 1.97 4.37 4.37v.1h.1c2.4 0 4.37 1.97 4.37 4.37H2V11.53z"/>
      </svg>
      Import from JIRA
    `;
    
    uploadBtn.parentNode.insertBefore(jiraImportBtn, uploadBtn.nextSibling);
    
    // Add event listeners
    setupJiraEventListeners();
  }
}

// Setup all JIRA event listeners
function setupJiraEventListeners() {
  const jiraImportBtn = document.getElementById('jiraImportMenuBtn');
  
  // Main menu button
  if (jiraImportBtn) {
    jiraImportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showJiraImportModal();
      
      // Close profile menu
      const profileMenu = document.getElementById('profileMenu');
      if (profileMenu) {
        profileMenu.classList.remove('show');
      }
    });
  }
  
  // Connection step listeners
  const testConnectionBtn = document.getElementById('testJiraConnection');
  const proceedBtn = document.getElementById('proceedToStories');
  
  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', testJiraConnection);
  }
  
  if (proceedBtn) {
    proceedBtn.addEventListener('click', loadJiraStories);
  }
  
  // Selection step listeners
  const applyFiltersBtn = document.getElementById('applyJiraFilters');
  const selectAllBtn = document.getElementById('selectAllJiraStories');
  const deselectAllBtn = document.getElementById('deselectAllJiraStories');
  const importBtn = document.getElementById('importSelectedStories');
  
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', filterJiraStories);
  }
  
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.jira-story-checkbox').forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
      });
    });
  }
  
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.jira-story-checkbox').forEach(cb => {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
      });
    });
  }
  
  if (importBtn) {
    importBtn.addEventListener('click', importSelectedStories);
  }
  
  // Filter listeners
  const searchInput = document.getElementById('jiraSearchInput');
  const statusFilter = document.getElementById('jiraStatusFilter');
  const typeFilter = document.getElementById('jiraTypeFilter');
  
  if (searchInput) {
    searchInput.addEventListener('input', filterJiraStories);
  }
  
  if (statusFilter) {
    statusFilter.addEventListener('change', filterJiraStories);
  }
  
  if (typeFilter) {
    typeFilter.addEventListener('change', filterJiraStories);
  }
}

// Expose functions for external use
window.JiraIntegration = {
  showJiraImportModal,
  hideJiraImportModal,
  testJiraConnection,
  loadJiraStories,
  importSelectedStories,
  initializeJiraIntegration
};

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeJiraIntegration);
} else {
  initializeJiraIntegration();
}

window.showJiraImportModal = showJiraImportModal;
window.hideJiraImportModal = hideJiraImportModal;
window.backToJiraConnection = backToJiraConnection;
