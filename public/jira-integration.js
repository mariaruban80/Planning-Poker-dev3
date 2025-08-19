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

// ========== ENHANCED SMART CONNECTION FUNCTIONS ==========

// Enhanced JIRA connection with better UX
async function smartJiraConnection() {
  const url = document.getElementById('jiraUrl').value.trim();
  const email = document.getElementById('jiraEmail').value.trim();
  const project = document.getElementById('jiraProject').value.trim();
  
  if (!url || !project) {
    showConnectionStatus('error', 'Please fill in JIRA URL and Project Key');
    return false;
  }
  
  // Step 1: Try anonymous access first
  showConnectionStatus('loading', 'Checking if authentication is required...');
  
  const anonymousTest = await testAnonymousAccess(url, project);
  if (anonymousTest.success) {
    showConnectionStatus('success', 'Connected without authentication! 🎉');
    document.getElementById('proceedToStories').disabled = false;
    saveJiraCredentials();
    jiraConnection = { url, email: '', token: '', project, isAnonymous: true };
    return true;
  }
  
  // Step 2: If auth required, check if token is provided
  const token = document.getElementById('jiraToken').value.trim();
  
  if (!token) {
    showTokenHelp();
    return false;
  }
  
  if (!email) {
    showConnectionStatus('error', 'Email is required when using API token');
    return false;
  }
  
  // Step 3: Try with provided token
  return testJiraConnectionWithToken(url, email, token, project);
}

// Test anonymous access to JIRA
async function testAnonymousAccess(jiraUrl, projectKey) {
  try {
    const baseUrl = jiraUrl.endsWith('/') ? jiraUrl.slice(0, -1) : jiraUrl;

    const response = await fetch('/api/jira/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jiraUrl: baseUrl, projectKey })
    });

    if (response.ok) {
      const projectData = await response.json();
      return { success: true, requiresAuth: false, projectName: projectData.name };
    } else if (response.status === 401 || response.status === 403) {
      return { success: false, requiresAuth: true };
    } else {
      return { success: false, requiresAuth: true, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log('[JIRA] Anonymous access test failed:', error.message);
    return { success: false, requiresAuth: true, error: error.message };
  }
}

// Test JIRA Connection with token (enhanced version)
async function testJiraConnectionWithToken(url, email, token, project) {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

    const response = await fetch('/api/jira/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jiraUrl: baseUrl, email, token, projectKey: project })
    });

    if (response.ok) {
      const projectData = await response.json();
      showConnectionStatus('success', `Connected successfully! Found "${projectData.name}" project 🎉`);
      document.getElementById('proceedToStories').disabled = false;
      saveJiraCredentials();
      jiraConnection = { url, email, token, project, isAnonymous: false };
      return true;
    } else {
      const errorText = response.status === 401 ? 'Invalid credentials' : 
                       response.status === 404 ? 'Project not found' : 
                       `API error: ${response.status}`;
      showConnectionStatus('error', errorText);
      return false;
    }
  } catch (error) {
    console.error('JIRA connection test failed:', error.message);
    showConnectionStatus('error', 'Connection failed. Check URL and network connection.');
    return false;
  }
}


// Show helpful token generation guidance
function showTokenHelp() {
  const helpDiv = document.createElement('div');
  helpDiv.className = 'jira-token-help';
  helpDiv.innerHTML = `
    <div style="background: linear-gradient(135deg, #f0f8ff 0%, #e6f3ff 100%); border: 2px solid #4a90e2; border-radius: 12px; padding: 20px; margin: 15px 0; box-shadow: 0 4px 12px rgba(74, 144, 226, 0.1);">
      <div style="display: flex; align-items: center; margin-bottom: 15px;">
        <div style="width: 40px; height: 40px; background: #4a90e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
          🔐
        </div>
        <div>
          <h4 style="margin: 0; color: #2c5282; font-size: 18px;">Authentication Required</h4>
          <p style="margin: 5px 0 0 0; color: #4a5568; font-size: 14px;">This JIRA instance requires authentication. No worries, it's quick!</p>
        </div>
      </div>
      
      <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
        <h5 style="margin: 0 0 10px 0; color: #2c5282; font-size: 16px;">📋 Quick Setup Steps:</h5>
        <ol style="margin: 0; padding-left: 20px; color: #4a5568;">
          <li>Click the "Generate Token" button below</li>
          <li>On the Atlassian page, click "Create API token"</li>
          <li>Name it something like "Planning Poker"</li>
          <li>Copy the generated token</li>
          <li>Come back and paste it in the API Token field above</li>
        </ol>
      </div>
      
      <div style="display: flex; gap: 10px; align-items: center;">
        <button onclick="openTokenGenerator()" class="jira-btn jira-btn-primary" style="display: flex; align-items: center; gap: 8px;">
          🔗 Generate API Token
        </button>
        <button onclick="dismissTokenHelp()" class="jira-btn jira-btn-secondary">
          I'll do this later
        </button>
      </div>
      
      <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 6px; border: 1px solid #ffeaa7;">
        <small style="color: #856404; display: flex; align-items: center; gap: 8px;">
          <span>💡</span>
          <strong>Tip:</strong> API tokens are safer than passwords and can be revoked anytime.
        </small>
      </div>
    </div>
  `;
  
  const statusEl = document.getElementById('jiraConnectionStatus');
  statusEl.innerHTML = '';
  statusEl.appendChild(helpDiv);
  statusEl.style.display = 'block';
}

// Open token generator in new tab
function openTokenGenerator() {
  window.open('https://id.atlassian.com/manage-profile/security/api-tokens', '_blank');
  
  // Update the help text to show next steps
  const helpEl = document.querySelector('.jira-token-help');
  if (helpEl) {
    const waitingDiv = document.createElement('div');
    waitingDiv.innerHTML = `
      <div style="background: #e8f5e8; border: 2px solid #4caf50; border-radius: 8px; padding: 15px; margin-top: 15px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
        <p style="margin: 0; color: #2e7d2e; font-weight: 600;">Waiting for you to generate the token...</p>
        <p style="margin: 5px 0 0 0; color: #4a5568; font-size: 14px;">Once you have the token, paste it above and try connecting again</p>
      </div>
    `;
    helpEl.appendChild(waitingDiv);
  }
}

// Dismiss token help
function dismissTokenHelp() {
  const statusEl = document.getElementById('jiraConnectionStatus');
  statusEl.style.display = 'none';
  statusEl.innerHTML = '';
}

// Helper function to extract description text from JIRA's complex description format
function extractDescription(descriptionObj) {
  if (!descriptionObj) return '';
  
  try {
    if (typeof descriptionObj === 'string') return descriptionObj;
    
    if (descriptionObj.content && Array.isArray(descriptionObj.content)) {
      return descriptionObj.content.map(paragraph => {
        if (paragraph.content && Array.isArray(paragraph.content)) {
          return paragraph.content.map(item => item.text || '').join(' ');
        }
        return paragraph.text || '';
      }).join(' ').trim();
    }
    
    return '';
  } catch (error) {
    return '';
  }
}

// ========== EXISTING FUNCTIONS (UPDATED) ==========

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

// Enhanced load JIRA stories function
async function loadJiraStories() {
  if (!jiraConnection) {
    showConnectionStatus('error', 'No active JIRA connection');
    return;
  }

  showJiraLoadingIndicator(true);

  try {
    const baseUrl = jiraConnection.url.endsWith('/') ? jiraConnection.url.slice(0, -1) : jiraConnection.url;

    const response = await fetch('/api/jira/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jiraUrl: baseUrl,
        email: jiraConnection.email,
        token: jiraConnection.token,
        projectKey: jiraConnection.project
      })
    });

    if (response.ok) {
      const data = await response.json();
      const issues = data.issues || [];

      jiraStories = issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        description: extractDescription(issue.fields.description),
        issueType: issue.fields.issuetype?.name || 'Unknown',
        status: issue.fields.status?.name || 'Unknown',
        priority: issue.fields.priority?.name || 'Medium',
        assignee: issue.fields.assignee?.displayName || null,
        storyPoints: issue.fields.customfield_10016 || null
      }));

      displayJiraStories(jiraStories);

      document.getElementById('jiraConnectionStep').classList.remove('active');
      document.getElementById('jiraSelectionStep').classList.add('active');
    } else {
      showConnectionStatus('error', `Failed to load stories: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to load JIRA stories:', error);
    showConnectionStatus('error', 'Failed to load stories. Please check your connection.');
  } finally {
    showJiraLoadingIndicator(false);
  }
}
  
  showJiraLoadingIndicator(true);
  
  try {
    let response;
    const baseUrl = jiraConnection.url.endsWith('/') ? jiraConnection.url.slice(0, -1) : jiraConnection.url;
    const jql = `project = "${jiraConnection.project}" AND issueType IN (Story, Task, Bug, Epic) ORDER BY created DESC`;
    
    const requestOptions = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000
    };
    
    // Add authentication header if not anonymous
    if (!jiraConnection.isAnonymous) {
      const auth = btoa(`${jiraConnection.email}:${jiraConnection.token}`);
      requestOptions.headers['Authorization'] = `Basic ${auth}`;
    }
    
    const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=key,summary,description,issuetype,status,priority,assignee,customfield_10016`;
    
    response = await fetch(url, requestOptions);
    
    if (response.ok) {
      const data = await response.json();
      const issues = data.issues || [];
      
      jiraStories = issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        description: extractDescription(issue.fields.description),
        issueType: issue.fields.issuetype?.name || 'Unknown',
        status: issue.fields.status?.name || 'Unknown',
        priority: issue.fields.priority?.name || 'Medium',
        assignee: issue.fields.assignee?.displayName || null,
        storyPoints: issue.fields.customfield_10016 || null
      }));
      
      displayJiraStories(jiraStories);
      
      // Switch to story selection step
      document.getElementById('jiraConnectionStep').classList.remove('active');
      document.getElementById('jiraSelectionStep').classList.add('active');
    } else {
      showConnectionStatus('error', `Failed to load stories: HTTP ${response.status}`);
    }
    
  } catch (error) {
    console.error('Failed to load JIRA stories:', error);
    showConnectionStatus('error', 'Failed to load stories. Please check your connection.');
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

  //Add check to see if only visible
  const isHost = sessionStorage.getItem('isHost') === 'true';

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

    if(isHost){
      uploadBtn.parentNode.insertBefore(jiraImportBtn, uploadBtn.nextSibling);
    }

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
  
  // Smart connect button (NEW)
  const smartConnectBtn = document.getElementById('smartJiraConnect');
  if (smartConnectBtn) {
    smartConnectBtn.addEventListener('click', smartJiraConnection);
  }
  
  // Proceed to stories button
  const proceedBtn = document.getElementById('proceedToStories');
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
  smartJiraConnection,
  loadJiraStories,
  importSelectedStories,
  initializeJiraIntegration
};

// Make functions available globally for onclick handlers
window.showJiraImportModal = showJiraImportModal;
window.hideJiraImportModal = hideJiraImportModal;
window.backToJiraConnection = backToJiraConnection;
window.openTokenGenerator = openTokenGenerator;
window.dismissTokenHelp = dismissTokenHelp;

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeJiraIntegration);
} else {
  initializeJiraIntegration();
}
