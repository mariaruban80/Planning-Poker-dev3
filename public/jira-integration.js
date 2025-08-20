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
// 🔥 ADD THE NEW FUNCTIONS HERE - AFTER THE CONNECTION FUNCTIONS

// Enhanced JQL search with better error handling
async function performJiraSearch() {
  if (!jiraConnection) {
    showConnectionStatus('error', 'No active JIRA connection');
    return;
  }

  const jqlInput = document.getElementById('jiraJqlInput');
  const customJql = jqlInput?.value.trim() || '';
  
  showJiraLoadingIndicator(true);
  
  try {
    const baseUrl = jiraConnection.url.endsWith('/') ? 
      jiraConnection.url.slice(0, -1) : jiraConnection.url;

    // Build JQL - ensure project is included
    let finalJql;
    if (customJql) {
      // Check if JQL already includes project
      if (customJql.toLowerCase().includes('project')) {
        finalJql = customJql;
      } else {
        finalJql = `project = ${jiraConnection.project} AND (${customJql})`;
      }
    } else {
      finalJql = `project = ${jiraConnection.project} ORDER BY created DESC`;
    }

    console.log('[JIRA] Executing JQL search:', finalJql);

    const response = await fetch('/api/jira/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jiraUrl: baseUrl,
        email: jiraConnection.email,
        token: jiraConnection.token,
        projectKey: jiraConnection.project,
        jql: finalJql
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[JIRA] Search response:', data);
      
      if (data.issues && Array.isArray(data.issues)) {
        jiraStories = data.issues.map(issue => ({
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

        console.log(`[JIRA] Successfully loaded ${jiraStories.length} stories`);
        displayJiraStories(jiraStories);
        
        // Show success message
        showConnectionStatus('success', `Found ${jiraStories.length} stories`);
      } else {
        console.warn('[JIRA] No issues in response:', data);
        jiraStories = [];
        displayJiraStories([]);
        showConnectionStatus('error', 'No issues found');
      }
    } else {
      const errorText = await response.text();
      console.error('[JIRA] Search failed:', response.status, errorText);
      showConnectionStatus('error', `Search failed: ${response.status}`);
    }
  } catch (error) {
    console.error('[JIRA] Search error:', error);
    showConnectionStatus('error', 'Search failed: ' + error.message);
  } finally {
    showJiraLoadingIndicator(false);
  }
}

// Apply filters to currently displayed stories
function applyJiraFilters() {
  const statusValue = document.getElementById('jiraStatusFilter')?.value || '';
  const typeValue = document.getElementById('jiraTypeFilter')?.value || '';
  
  const rows = document.querySelectorAll('.jira-story-row');
  let visibleCount = 0;
  
  rows.forEach(row => {
    const checkbox = row.querySelector('.jira-story-checkbox');
    const storyStatus = checkbox?.dataset.status || '';
    const storyType = checkbox?.dataset.type || '';
    
    let shouldShow = true;
    
    // Apply status filter
    if (statusValue && storyStatus !== statusValue) {
      shouldShow = false;
    }
    
    // Apply type filter  
    if (typeValue && storyType !== typeValue) {
      shouldShow = false;
    }
    
    row.style.display = shouldShow ? '' : 'none';
    if (shouldShow) visibleCount++;
  });
  
  console.log(`[JIRA] Applied filters, ${visibleCount} stories visible`);
  
  // Update checkbox logic for filtered results
  setupJiraCheckboxLogic();
}

// Setup enhanced checkbox logic
function setupJiraCheckboxLogic() {
  const headerCheckbox = document.getElementById('jiraSelectAllCheckbox');
  const storyCheckboxes = document.querySelectorAll('.jira-story-checkbox');
  const selectedCountEl = document.getElementById('selectedCount');
  const importBtn = document.getElementById('importSelectedStories');

  // Get only visible checkboxes for filtering
  const visibleCheckboxes = [...storyCheckboxes].filter(cb => {
    const row = cb.closest('tr');
    return row && row.style.display !== 'none';
  });

  function updateSelectionState() {
    const selectedCount = visibleCheckboxes.filter(cb => cb.checked).length;
    const totalVisible = visibleCheckboxes.length;
    
    // Update selection count display
    if (selectedCountEl) {
      selectedCountEl.textContent = `${selectedCount} selected`;
    }
    
    // Update import button state
    if (importBtn) {
      importBtn.disabled = selectedCount === 0;
    }
    
    // Update header checkbox state (only consider visible checkboxes)
    if (headerCheckbox && totalVisible > 0) {
      if (selectedCount === 0) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
      } else if (selectedCount === totalVisible) {
        headerCheckbox.checked = true;
        headerCheckbox.indeterminate = false;
      } else {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = true;
      }
    }
    
    // Visual feedback for selected rows
    storyCheckboxes.forEach(cb => {
      const row = cb.closest('tr');
      if (row) {
        if (cb.checked) {
          row.classList.add('selected');
        } else {
          row.classList.remove('selected');
        }
      }
    });
  }

  // Header checkbox handler - only affects visible checkboxes
  if (headerCheckbox) {
    // Remove old listeners
    const newHeaderCheckbox = headerCheckbox.cloneNode(true);
    headerCheckbox.parentNode.replaceChild(newHeaderCheckbox, headerCheckbox);
    
    newHeaderCheckbox.addEventListener('change', function() {
      const shouldSelectAll = this.checked;
      
      visibleCheckboxes.forEach(cb => {
        cb.checked = shouldSelectAll;
      });
      
      updateSelectionState();
    });
  }

  // Individual checkbox handlers
  visibleCheckboxes.forEach(cb => {
    cb.addEventListener('change', updateSelectionState);
  });

  // Initialize state
  updateSelectionState();
}

// -----------------------------------------------------------
// 🔥 REPLACE THE EXISTING displayJiraStories FUNCTION WITH THIS ONE

// Enhanced story display function with working filters
function displayJiraStories(stories) {
  const tableBody = document.getElementById('jiraStoriesTableBody');
  const selectedCountEl = document.getElementById('selectedCount');
  const headerCheckbox = document.getElementById('jiraSelectAllCheckbox');
  
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  if (!stories.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 40px; color: #6b7280;">
          No issues found for this query.
        </td>
      </tr>
    `;
    if (headerCheckbox) {
      headerCheckbox.style.display = 'none';
    }
    return;
  }

  // Show header checkbox if we have stories
  if (headerCheckbox) {
    headerCheckbox.style.display = 'block';
  }

  stories.forEach(story => {
    const row = document.createElement('tr');
    row.className = 'jira-story-row';
    row.innerHTML = `
      <td class="checkbox-cell">
        <input type="checkbox" 
               class="jira-story-checkbox"
               value="${story.key}"
               data-key="${story.key}"
               data-summary="${encodeURIComponent(story.summary || '')}"
               data-description="${encodeURIComponent(story.description || '')}"
               data-type="${story.issueType || ''}"
               data-status="${story.status || ''}"
               data-priority="${story.priority || ''}"
               data-url="${story.url}">
      </td>
      <td class="key-cell">
        <span class="jira-story-key">${story.key}</span>
      </td>
      <td class="status-cell">
        <span class="jira-story-status" data-status="${story.status}">${story.status || 'Unknown'}</span>
      </td>
      <td class="summary-cell">
        <div class="jira-story-summary">${escapeHtml(story.summary || '')}</div>
      </td>
    `;
    
    tableBody.appendChild(row);
  });

  setupJiraCheckboxLogic();
  setupJiraFiltering();
}

// Setup filtering functionality
function setupJiraFiltering() {
  const statusFilter = document.getElementById('jiraStatusFilter');
  const typeFilter = document.getElementById('jiraTypeFilter');
  const searchInput = document.getElementById('jiraSearchInput');
  
  function applyFilters() {
    const statusValue = statusFilter?.value || '';
    const typeValue = typeFilter?.value || '';
    const searchValue = searchInput?.value.toLowerCase() || '';
    
    const rows = document.querySelectorAll('.jira-story-row');
    let visibleCount = 0;
    
    rows.forEach(row => {
      const checkbox = row.querySelector('.jira-story-checkbox');
      const storyStatus = checkbox?.dataset.status || '';
      const storyType = checkbox?.dataset.type || '';
      const storySummary = checkbox?.dataset.summary ? 
        decodeURIComponent(checkbox.dataset.summary).toLowerCase() : '';
      const storyKey = checkbox?.dataset.key?.toLowerCase() || '';
      
      let shouldShow = true;
      
      // Apply status filter
      if (statusValue && storyStatus !== statusValue) {
        shouldShow = false;
      }
      
      // Apply type filter
      if (typeValue && storyType !== typeValue) {
        shouldShow = false;
      }
      
      // Apply search filter
      if (searchValue && 
          !storySummary.includes(searchValue) && 
          !storyKey.includes(searchValue)) {
        shouldShow = false;
      }
      
      row.style.display = shouldShow ? '' : 'none';
      if (shouldShow) visibleCount++;
    });
    
    console.log(`[JIRA] Filtered to ${visibleCount} visible stories`);
    
    // Update checkbox logic for visible items only
    setupJiraCheckboxLogic();
  }
  
  // Add event listeners for real-time filtering
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }
  
  if (typeFilter) {
    typeFilter.addEventListener('change', applyFilters);
  }
  
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }
}

// -----------------------------------------------------------
// Load stories via proxy (keep existing function but call performJiraSearch instead)
async function loadJiraStories() {
  if (!jiraConnection) {
    showConnectionStatus('error', 'No active JIRA connection');
    return;
  }

  // Switch to selection step
  $id('jiraConnectionStep')?.classList.remove('active');
  $id('jiraSelectionStep')?.classList.add('active');

  // Perform initial search
  await performJiraSearch();
}

// -----------------------------------------------------------
// KEEP ALL EXISTING FUNCTIONS BELOW THIS LINE...

// Toggle all checkboxes
function toggleSelectAllJiraStories(select = true) {
  document.querySelectorAll('#jiraStoriesList .jira-story-checkbox')
    .forEach(cb => { cb.checked = !!select; });
}

// Return selected stories using data-* (no reliance on global array order)
function getSelectedJiraStories() {
  const selected = [];
  document.querySelectorAll('.jira-story-checkbox:checked').forEach(cb => {
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
  return issues.map(issue => ({
    jiraKey: issue.key,
    id: issue.key,
    name: `${issue.key}: ${issue.summary || ''}`.trim(),
    description: issue.description || '',
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

  if (window.socket && typeof window.socket.emit === 'function') {
    try {
      window.socket.emit('importJiraStories', appStories);
    } catch (e) {
      console.warn('[JIRA] Socket emit failed, falling back to DOM event.', e);
      document.dispatchEvent(new CustomEvent('jiraImportedStories', { detail: appStories }));
    }
  } else {
    document.dispatchEvent(new CustomEvent('jiraImportedStories', { detail: appStories }));
  }

  if (typeof window.displayStoriesInUI === 'function') {
    try { window.displayStoriesInUI(appStories, { append: true }); } catch {}
  }

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

// Escape HTML to avoid layout break from summary text
function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);
}

// -----------------------------------------------------------
// 🔥 ADD THE NEW EVENT LISTENERS AT THE END

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

  // 🔥 NEW EVENT LISTENERS FOR SEARCH AND FILTERS
  
  // JQL Search button
  const jiraSearchBtn = document.getElementById('jiraSearchBtn');
  if (jiraSearchBtn) {
    jiraSearchBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('[JIRA] Search button clicked');
      performJiraSearch();
    });
  }
  
  // Enter key in JQL input
  const jiraJqlInput = document.getElementById('jiraJqlInput');
  if (jiraJqlInput) {
    jiraJqlInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        performJiraSearch();
      }
    });
  }
  
  // Filter dropdowns - real-time filtering
  const statusFilter = document.getElementById('jiraStatusFilter');
  const typeFilter = document.getElementById('jiraTypeFilter');
  
  if (statusFilter) {
    statusFilter.addEventListener('change', function() {
      console.log('[JIRA] Status filter changed to:', this.value);
      applyJiraFilters();
    });
  }
  
  if (typeFilter) {
    typeFilter.addEventListener('change', function() {
      console.log('[JIRA] Type filter changed to:', this.value);
      applyJiraFilters();
    });
  }

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
