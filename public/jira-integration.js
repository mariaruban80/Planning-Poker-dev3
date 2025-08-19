// -------------------- JIRA Integration (fixed end-to-end) --------------------

let jiraConnection = null;
let jiraStories = [];

// Utility: by ID
const $id = (id) => document.getElementById(id);

// Show the JIRA import modal
function showJiraImportModal() {
  const modal = $id('jiraImportModal');
  if (modal) modal.style.display = 'flex';
}

// Hide the modal
function hideJiraImportModal() {
  const modal = $id('jiraImportModal');
  if (modal) modal.style.display = 'none';
}

// Go back to the connection step
function backToJiraConnection() {
  $id('jiraConnectionStep')?.classList.add('active');
  $id('jiraSelectionStep')?.classList.remove('active');
}

// Reset the JIRA modal completely
function resetJiraModal() {
  jiraConnection = null;
  jiraStories = [];
  if ($id('jiraUrl')) $id('jiraUrl').value = '';
  if ($id('jiraEmail')) $id('jiraEmail').value = '';
  if ($id('jiraToken')) $id('jiraToken').value = '';
  if ($id('jiraProject')) $id('jiraProject').value = '';
  $id('jiraConnectionStep')?.classList.add('active');
  $id('jiraSelectionStep')?.classList.remove('active');
  hideJiraImportModal();
}

// Save credentials to local storage
function saveJiraCredentials() {
  const creds = {
    url: $id('jiraUrl')?.value.trim() || '',
    email: $id('jiraEmail')?.value.trim() || '',
    token: $id('jiraToken')?.value.trim() || '',
    project: $id('jiraProject')?.value.trim() || ''
  };
  try { localStorage.setItem('jiraCredentials', JSON.stringify(creds)); } catch {}
}

// Extract description text safely (handles ADF minimal)
function extractDescription(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (Array.isArray(desc)) return desc.join('\n');
  if (desc.content) {
    return desc.content.map(block =>
      block?.content ? block.content.map(c => (c?.text || '')).join(' ') : ''
    ).join('\n');
  }
  return '';
}

// Show a status message inside modal
function showConnectionStatus(type, message) {
  console.log('[JIRA] Connection status:', type, message);
  let statusEl = $id('jiraConnectionStatus');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'jiraConnectionStatus';
    statusEl.className = 'connection-status-indicator';
    const connectionSection = document.querySelector('.jira-connection-section');
    if (connectionSection) connectionSection.appendChild(statusEl);
  }
  statusEl.textContent = message;
  statusEl.className = `connection-status-indicator ${type}`;
  statusEl.style.display = 'block';
}

// Show or hide loading spinner
function showJiraLoadingIndicator(show) {
  const el = $id('jiraLoadingIndicator');
  if (el) el.style.display = show ? 'block' : 'none';
}

// -----------------------------------------------------------
// Test anonymous access via proxy
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
      return { success: true, requiresAuth: false, projectName: projectData?.name };
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

// Test connection with email/token via proxy
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
      showConnectionStatus('success', `Connected successfully! Found "${projectData?.name}" project 🎉`);
      $id('proceedToStories') && ($id('proceedToStories').disabled = false);
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

// Smart connection flow (tries anon, then token)
async function smartJiraConnection() {
  console.log('[JIRA] Smart connection started');
  const url = $id('jiraUrl')?.value.trim() || '';
  const project = $id('jiraProject')?.value.trim() || '';
  const email = $id('jiraEmail')?.value.trim() || '';
  const token = $id('jiraToken')?.value.trim() || '';

  console.log('[JIRA] Connection details:', { url, project, email: email ? 'provided' : 'empty', token: token ? 'provided' : 'empty' });
  showConnectionStatus('loading', 'Testing connection...');

  try {
    const anon = await testAnonymousAccess(url, project);
    if (anon.success && !anon.requiresAuth) {
      showConnectionStatus('success', `Connected anonymously to "${anon.projectName}" 🎉`);
      jiraConnection = { url, email: null, token: null, project, isAnonymous: true };
      $id('proceedToStories') && ($id('proceedToStories').disabled = false);
      return;
    }

    if (email && token) {
      await testJiraConnectionWithToken(url, email, token, project);
    } else {
      showConnectionStatus('error', 'Authentication required. Please enter email & token.');
    }
  } catch (error) {
    console.error('[JIRA] Smart connection error:', error);
    showConnectionStatus('error', 'Connection failed: ' + error.message);
  }
}

// -----------------------------------------------------------
// Load stories via proxy
async function loadJiraStories() {
  if (!jiraConnection) {
    showConnectionStatus('error', 'No active JIRA connection');
    return;
  }

  showJiraLoadingIndicator(true);

  try {
    const baseUrl = jiraConnection.url.endsWith('/') ? jiraConnection.url.slice(0, -1) : jiraConnection.url;

    // Optional JQL support if you add an input with id=jiraJql
    const jqlInput = $id('jiraJql');
    const jql = jqlInput && jqlInput.value ? jqlInput.value : undefined;

    const response = await fetch('/api/jira/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jiraUrl: baseUrl,
        email: jiraConnection.email,
        token: jiraConnection.token,
        projectKey: jiraConnection.project,
        ...(jql ? { jql } : {})
      })
    });

    if (response.ok) {
      const data = await response.json();
      const issues = data.issues || [];

      jiraStories = issues.map(issue => ({
        key: issue.key,
        summary: issue.fields?.summary || '',
        description: extractDescription(issue.fields?.description),
        issueType: issue.fields?.issuetype?.name || 'Unknown',
        status: issue.fields?.status?.name || 'Unknown',
        priority: issue.fields?.priority?.name || 'Medium',
        assignee: issue.fields?.assignee?.displayName || null,
        storyPoints: issue.fields?.customfield_10016 || null,
        url: (jiraConnection.url || '').replace(/\/$/, '') + '/browse/' + issue.key
      }));

      displayJiraStories(jiraStories);

      $id('jiraConnectionStep')?.classList.remove('active');
      $id('jiraSelectionStep')?.classList.add('active');

      // Update count if you have a counter element
      const countEl = $id('jiraStoriesCount');
      if (countEl) countEl.textContent = String(jiraStories.length);
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

// Display the fetched stories in UI (with checkboxes + data attributes)

function displayJiraStories(stories) {
  const container = $id('jiraStoriesList');
  if (!container) return;
  container.innerHTML = '';

  if (!stories.length) {
    container.innerHTML = '<div class="jira-empty">No issues found for this query.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  stories.forEach(story => {
    const div = document.createElement('div');
    div.className = 'jira-story';
    div.innerHTML = `
      <label class="jira-story-row">
        <input type="checkbox"
               class="jira-story-checkbox"
               value="${story.key}"
               data-key="${story.key}"
               data-summary="${encodeURIComponent(story.summary || '')}"
               data-description="${encodeURIComponent(story.description || '')}"
               data-type="${story.issueType || ''}"
               data-status="${story.status || ''}"
               data-priority="${story.priority || ''}"
               data-assignee="${encodeURIComponent(story.assignee || '')}"
               data-storypoints="${story.storyPoints ?? ''}"
               data-url="${story.url}">
        <span class="jira-story-text">
          <strong>${story.key}</strong>: ${escapeHtml(story.summary || '')}
        </span>
      </label>`;
    fragment.appendChild(div);
  });

  container.appendChild(fragment);

  // === Hook up buttons and checkbox logic ===
  const importBtn = $id('importSelectedStoriesBtn');
  const selectAllBtn = $id('selectAllStoriesBtn');
  const deselectAllBtn = $id('deselectAllStoriesBtn');
  const checkboxes = container.querySelectorAll('.jira-story-checkbox');

  // Helper: refresh button state
  const updateImportButtonState = () => {
    const anyChecked = [...checkboxes].some(cb => cb.checked);
    if (importBtn) importBtn.disabled = !anyChecked;
  };

  // Add listener to each checkbox
  checkboxes.forEach(cb => {
    cb.addEventListener('change', updateImportButtonState);
  });

  // Select All
  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      checkboxes.forEach(cb => cb.checked = true);
      updateImportButtonState();
    };
  }

  // Deselect All
  if (deselectAllBtn) {
    deselectAllBtn.onclick = () => {
      checkboxes.forEach(cb => cb.checked = false);
      updateImportButtonState();
    };
  }

  // Initialize state on render
  updateImportButtonState();
}


// Escape HTML to avoid layout break from summary text
function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);
}

// Toggle all checkboxes
function toggleSelectAllJiraStories(select = true) {
  document.querySelectorAll('#jiraStoriesList .jira-story-checkbox')
    .forEach(cb => { cb.checked = !!select; });
}

// Return selected stories using data-* (no reliance on global array order)
function getSelectedJiraStories() {
  const selected = [];
  document.querySelectorAll('#jiraStoriesList .jira-story-checkbox:checked').forEach(cb => {
    selected.push({
      key: cb.dataset.key,
      summary: decodeURIComponent(cb.dataset.summary || ''),
      description: decodeURIComponent(cb.dataset.description || ''),
      issueType: cb.dataset.type || 'Unknown',
      status: cb.dataset.status || 'Unknown',
      priority: cb.dataset.priority || 'Medium',
      assignee: decodeURIComponent(cb.dataset.assignee || ''),
      storyPoints: cb.dataset.storypoints || null,
      url: cb.dataset.url || ''
    });
  });
  return selected;
}

// Map JIRA issues to your app's story schema
function mapJiraToAppStories(issues) {
  // If your app expects { id, name, description }, create accordingly
  return issues.map(issue => ({
    // Keep original key for traceability
    jiraKey: issue.key,
    id: issue.key, // you can change to a generated id if needed
    name: `${issue.key}: ${issue.summary || ''}`.trim(),
    description: issue.description || '',
    // Optional metadata to keep
    meta: {
      source: 'jira',
      url: issue.url,
      issueType: issue.issueType,
      status: issue.status,
      priority: issue.priority,
      assignee: issue.assignee,
      storyPoints: issue.storyPoints
    }
  }));
}

// Import selected stories: push to app via socket (or fallback)
function importSelectedJiraStories() {
  const selected = getSelectedJiraStories();
  if (!selected.length) {
    alert('No stories selected.');
    return;
  }

  console.log('[JIRA] Importing selected stories:', selected.length);
  const appStories = mapJiraToAppStories(selected);

  // Preferred: use your socket event if available
  if (window.socket && typeof window.socket.emit === 'function') {
    try {
      window.socket.emit('importJiraStories', appStories);
    } catch (e) {
      console.warn('[JIRA] Socket emit failed, falling back to DOM event.', e);
      document.dispatchEvent(new CustomEvent('jiraImportedStories', { detail: appStories }));
    }
  } else {
    // Fallback: fire a DOM event your app can listen to
    document.dispatchEvent(new CustomEvent('jiraImportedStories', { detail: appStories }));
  }

  // Optionally update UI immediately if you have a renderer
  if (typeof window.displayStoriesInUI === 'function') {
    try { window.displayStoriesInUI(appStories, { append: true }); } catch {}
  }

  // Close modal
  hideJiraImportModal();
}

// -----------------------------------------------------------
// Initialization (hook menu button, etc.)
function initializeJiraIntegration() {
  console.log('[JIRA] Initializing JIRA integration module');

  const isHost = sessionStorage.getItem('isHost') === 'true';
  console.log(`[JIRA] JIRA import -> isHost: ${isHost}`);

  if (!isHost) {
    console.log('[JIRA] User is guest or not the host - hiding JIRA import');
    return;
  }
}

// Initialize JIRA modal event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('[JIRA] Setting up JIRA modal event listeners');

  // Smart Connect
  $id('smartJiraConnect')?.addEventListener('click', function(e) {
    e.preventDefault();
    console.log('[JIRA] Smart Connect button clicked');
    smartJiraConnection();
  });

  // Proceed to Stories
  $id('proceedToStories')?.addEventListener('click', function(e) {
    e.preventDefault();
    console.log('[JIRA] Proceed to Stories button clicked');
    loadJiraStories();
  });

  // Select all / deselect all
  $id('jiraSelectAll')?.addEventListener('click', function(e) {
    e.preventDefault();
    toggleSelectAllJiraStories(true);
  });
  $id('jiraDeselectAll')?.addEventListener('click', function(e) {
    e.preventDefault();
    toggleSelectAllJiraStories(false);
  });

  // Import selected
  $id('jiraImportSelectedBtn')?.addEventListener('click', function(e) {
    e.preventDefault();
    importSelectedJiraStories();
  });

  // Cancel buttons
  document.querySelectorAll('.jira-btn-cancel').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('[JIRA] Cancel button clicked');
      hideJiraImportModal();
    });
  });

  // Close (X)
  document.querySelectorAll('#jiraImportModal .close-button').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('[JIRA] Close button clicked');
      hideJiraImportModal();
    });
  });

  // Back button
  $id('jiraBackBtn')?.addEventListener('click', function(e) {
    e.preventDefault();
    console.log('[JIRA] Back button clicked');
    backToJiraConnection();
  });
});

// Optional: listen for server confirmation to refresh UI
if (window.socket) {
  try {
    window.socket.on?.('jiraStoriesImported', (allStories) => {
      console.log('[SOCKET] Received updated stories from JIRA:', allStories?.length);
      if (typeof window.displayStoriesInUI === 'function') {
        try { window.displayStoriesInUI(allStories); } catch {}
      }
    });
  } catch {}
}

// Expose to window
window.JiraIntegration = {
  initializeJiraIntegration,
  showJiraImportModal,
  hideJiraImportModal,
  backToJiraConnection,
  smartJiraConnection,
  loadJiraStories,
  resetJiraModal,
  importSelectedJiraStories,
  toggleSelectAllJiraStories
};
