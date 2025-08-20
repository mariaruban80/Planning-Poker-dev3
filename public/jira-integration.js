let jiraConnection = null;
let jiraStories = [];

const $id = (id) => document.getElementById(id);

// --- Modal Functions ---
function showJiraImportModal() {
    const modal = $id('jiraImportModal');
    if (modal) modal.style.display = 'flex';
}

function hideJiraImportModal() {
    const modal = $id('jiraImportModal');
    if (modal) modal.style.display = 'none';
}

function backToJiraConnection() {
    $id('jiraConnectionStep')?.classList.add('active');
    $id('jiraSelectionStep')?.classList.remove('active');
}

function resetJiraModal() {
    jiraConnection = null;
    jiraStories = [];
    $id('jiraUrl') && ($id('jiraUrl').value = '');
    $id('jiraEmail') && ($id('jiraEmail').value = '');
    $id('jiraToken') && ($id('jiraToken').value = '');
    $id('jiraProject') && ($id('jiraProject').value = '');
    $id('jiraConnectionStep')?.classList.add('active');
    $id('jiraSelectionStep')?.classList.remove('active');
    hideJiraImportModal();
}
function initializeJiraIntegration() {
    console.log("[JIRA] Initializing Jira Integration");

    // Load saved credentials if present
    try {
        const savedCreds = localStorage.getItem("jiraCredentials");
        if (savedCreds) {
            const { url, email, token, project } = JSON.parse(savedCreds);
            if ($id("jiraUrl")) $id("jiraUrl").value = url || "";
            if ($id("jiraEmail")) $id("jiraEmail").value = email || "";
            if ($id("jiraToken")) $id("jiraToken").value = token || "";
            if ($id("jiraProject")) $id("jiraProject").value = project || "";
            console.log("[JIRA] Restored saved credentials");
        }
    } catch (err) {
        console.warn("[JIRA] Could not restore credentials:", err);
    }

    // Ensure modal starts in connection step
    if ($id('jiraConnectionStep')) {
        $id('jiraConnectionStep').classList.add('active');
    }
    if ($id('jiraSelectionStep')) {
        $id('jiraSelectionStep').classList.remove('active');
    }
}
function importSelectedJiraStories() {
    const selectedCheckboxes = document.querySelectorAll('.jira-story-checkbox:checked');
    if (!selectedCheckboxes.length) {
        alert('Please select at least one story to import.');
        return;
    }

    const importedStories = [];
    selectedCheckboxes.forEach(cb => {
        const story = {
            id: cb.dataset.key,
            name: decodeURIComponent(cb.dataset.summary || ''),
            description: decodeURIComponent(cb.dataset.description || ''),
            type: cb.dataset.type || '',
            status: cb.dataset.status || '',
            priority: cb.dataset.priority || '',
            url: cb.dataset.url || ''
        };

        importedStories.push(story);

        // 🚀 Push story into Planning Poker UI via socket or local method
        if (window.addNewStoryCard) {
            // Your app's frontend story card method
            window.addNewStoryCard(story.name, story.description, story.id);
        }
        if (window.socket) {
            // Broadcast to all clients
            window.socket.emit('addStory', story);
        }
    });

    console.log(`[JIRA] Imported ${importedStories.length} stories`, importedStories);
    hideJiraImportModal();
}
// --- Helper Functions ---
function saveJiraCredentials() {
    const creds = {
        url: $id('jiraUrl')?.value.trim() || '',
        email: $id('jiraEmail')?.value.trim() || '',
        token: $id('jiraToken')?.value.trim() || '',
        project: $id('jiraProject')?.value.trim() || ''
    };
    try {
        localStorage.setItem('jiraCredentials', JSON.stringify(creds));
    } catch (error) {
        console.error("Error saving credentials:", error);
    }
}

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

function showJiraLoadingIndicator(show) {
    const el = $id('jiraLoadingIndicator');
    if (el) el.style.display = show ? 'flex' : 'none';
    const tableWrapper = document.querySelector('.jira-stories-table-wrapper');
    if (tableWrapper) tableWrapper.style.display = show ? 'none' : 'block';
}

function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[ch]);
}

// --- Connection Functions ---
async function testAnonymousAccess(jiraUrl, projectKey) {
    try {
        const response = await fetch('/api/jira/test-anonymous', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl, projectKey })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showConnectionStatus('success', 'Connected anonymously to JIRA project.');
                jiraConnection = { url: jiraUrl, email: null, token: null, project: projectKey };
                return true;
            }
        }
        showConnectionStatus('error', 'Anonymous access failed.');
        return false;
    } catch (err) {
        console.error('[JIRA] Anonymous access error:', err);
        showConnectionStatus('error', 'Anonymous access failed, check console.');
        return false;
    }
}

async function testJiraConnectionWithToken(url, email, token, project) {
    try {
        const response = await fetch('/api/jira/test-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl: url, email, token, projectKey: project })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showConnectionStatus('success', 'Connected to JIRA with token.');
                jiraConnection = { url, email, token, project };
                saveJiraCredentials();
                return true;
            }
        }
        showConnectionStatus('error', 'Token-based connection failed.');
        return false;
    } catch (err) {
        console.error('[JIRA] Token connection error:', err);
        showConnectionStatus('error', 'Token connection failed, check console.');
        return false;
    }
}

async function smartJiraConnection() {
    const jiraUrl = $id('jiraUrl')?.value.trim();
    const email = $id('jiraEmail')?.value.trim();
    const token = $id('jiraToken')?.value.trim();
    const project = $id('jiraProject')?.value.trim();

    if (!jiraUrl || !project) {
        showConnectionStatus('error', 'Please provide JIRA URL and Project Key.');
        return;
    }

    if (email && token) {
        const success = await testJiraConnectionWithToken(jiraUrl, email, token, project);
        if (success) return;
    }

    // fallback to anonymous access
    await testAnonymousAccess(jiraUrl, project);
}

// --- Core JIRA Functions ---
async function performJiraSearch() {
    if (!jiraConnection) {
        showConnectionStatus('error', 'No active JIRA connection');
        return;
    }

    const jqlInput = $id('jiraJqlInput');
    const jql = jqlInput && jqlInput.value ? jqlInput.value.trim() : '';

    if (!jql) {
        showConnectionStatus('error', 'Please enter a JQL query.');
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
                projectKey: jiraConnection.project,
                jql
            })
        });

        showJiraLoadingIndicator(false);
        if (response.ok) {
            const data = await response.json();
            jiraStories = (data?.issues || []).map(issue => ({
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
        } else {
            showConnectionStatus('error', `Search failed: HTTP ${response.status}`);
        }
    } catch (err) {
        showJiraLoadingIndicator(false);
        console.error('[JIRA] performJiraSearch error:', err);
        showConnectionStatus('error', 'Search failed, check console for details.');
    }
}

function applyJiraFilters() {
    const statusFilter = $id('jiraStatusFilter')?.value || '';
    const typeFilter = $id('jiraTypeFilter')?.value || '';

    let filteredStories = jiraStories;

    if (statusFilter) {
        filteredStories = filteredStories.filter(story => story.status === statusFilter);
    }

    if (typeFilter) {
        filteredStories = filteredStories.filter(story => story.issueType === typeFilter);
    }

    displayJiraStories(filteredStories);
}

function setupJiraCheckboxLogic() {
    const headerCheckbox = $id('jiraSelectAllCheckbox');
    const checkboxes = document.querySelectorAll('.jira-story-checkbox');

    if (headerCheckbox) {
        headerCheckbox.addEventListener('change', () => {
            checkboxes.forEach(cb => {
                cb.checked = headerCheckbox.checked;
                if (headerCheckbox.checked) {
                    cb.closest('tr')?.classList.add('selected');
                } else {
                    cb.closest('tr')?.classList.remove('selected');
                }
            });
        });
    }

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (!cb.checked) {
                cb.closest('tr')?.classList.remove('selected');
            } else {
                cb.closest('tr')?.classList.add('selected');
            }
        });
    });
}

// --- Display and Rendering ---
function displayJiraStories(stories) {
    const tableBody = $id('jiraStoriesTableBody');
    const selectedCountEl = $id('selectedCount');
    const headerCheckbox = $id('jiraSelectAllCheckbox');

    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (!stories || stories.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">No stories found.</td></tr>`;
        if (headerCheckbox) headerCheckbox.style.display = 'none';
        selectedCountEl.textContent = "0 selected";
        return;
    }

    if (headerCheckbox) headerCheckbox.style.display = 'block';

    populateFilterDropdowns(stories);
    const rows = [];

    stories.forEach((story, index) => {
        const row = document.createElement('tr');
        row.className = 'jira-story-row';
        row.dataset.index = index;

        row.innerHTML = `
            <td class="checkbox-cell">
                <input type="checkbox" class="jira-story-checkbox" value="${story.key}" 
                    data-key="${story.key}" data-summary="${encodeURIComponent(story.summary)}" 
                    data-description="${encodeURIComponent(story.description)}" data-type="${story.issueType}" 
                    data-status="${story.status}" data-priority="${story.priority}" data-url="${story.url}">
            </td>
            <td class="key-cell"><span class="jira-story-key">${story.key}</span></td>
            <td class="status-cell"><span class="jira-story-status" data-status="${story.status}">${story.status}</span></td>
            <td><div class="jira-story-summary">${escapeHtml(story.summary)}</div></td>
        `;

        rows.push(row);
        tableBody.appendChild(row);
    });

    rows.forEach(row => {
        row.addEventListener('click', (e) => {
            const cell = row.querySelector('.checkbox-cell');
            const checkbox = cell.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;

            if (checkbox.checked) {
                row.classList.add("selected");
            } else {
                row.classList.remove("selected");
            }

            updateSelectionState();
        });
    });

    function updateSelectionState() {
        const selectedCount = document.querySelectorAll('.jira-story-checkbox:checked').length;
        selectedCountEl && (selectedCountEl.textContent = selectedCount + ' selected');
        const importSelectedStoriesBtn = document.getElementById("importSelectedStories");
        if (importSelectedStoriesBtn) importSelectedStoriesBtn.disabled = selectedCount === 0;
    }

    setupJiraCheckboxLogic();
    setupJiraFiltering();
}

// --- Utility Functions ---
async function loadJiraStories() {
    if (!jiraConnection) {
        showConnectionStatus('error', 'No active JIRA connection');
        return;
    }

    showJiraLoadingIndicator(true);

    try {
        const baseUrl = jiraConnection.url.endsWith('/') ? jiraConnection.url.slice(0, -1) : jiraConnection.url;
        const jqlInput = $id('jiraJql');    
        const jql = jqlInput && jqlInput.value ? jqlInput.value : undefined;

        const response = await fetch('/api/jira/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl: baseUrl, email: jiraConnection.email, token: jiraConnection.token, projectKey: jiraConnection.project, ...(jql ? { jql } : {}) })
        });

        showJiraLoadingIndicator(false);

        if (response.ok) {
            const data = await response.json();
            const issues = data?.issues || [];

            jiraStories = issues.map(issue => {
                return {
                    key: issue.key,
                    summary: issue.fields?.summary || '',
                    description: extractDescription(issue.fields?.description),
                    issueType: issue.fields?.issuetype?.name || 'Unknown',
                    status: issue.fields?.status?.name || 'Unknown',
                    priority: issue.fields?.priority?.name || 'Medium',
                    assignee: issue.fields?.assignee?.displayName || null,
                    storyPoints: issue.fields?.customfield_10016 || null,
                    url: (jiraConnection.url || '').replace(/\/$/, '') + '/browse/' + issue.key
                };
            });

            displayJiraStories(jiraStories);

            $id('jiraConnectionStep')?.classList.remove('active');
            $id('jiraSelectionStep')?.classList.add('active');

        } else {
            showConnectionStatus('error', `Failed to load stories: HTTP ${response.status}`);
        }

    } catch (error) {
        showJiraLoadingIndicator(false);
        console.error('Failed to load JIRA stories:', error);
        showConnectionStatus('error', 'Failed to load stories. Please check your connection.');
    }
}

function populateFilterDropdowns(stories) {
    const statusFilter = document.getElementById('jiraStatusFilter');
    const typeFilter = document.getElementById('jiraTypeFilter');

    if (statusFilter) {
        statusFilter.innerHTML = '<option value=""> All Statuses</option>';
        const uniqueStatuses = [...new Set(stories.map(s => s.status))];
        uniqueStatuses.forEach(status => {
            statusFilter.add(new Option(status, status));
        });
    }

    if (typeFilter) {
        typeFilter.innerHTML = '<option value = "">All Types </option>';
        const uniquetypes = [...new Set(stories.map(s => s.issueType))];
        uniquetypes.forEach(type => {
            typeFilter.add(new Option(type, type));
        });
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', function () {
    console.log('[JIRA] Setting up JIRA modal event listeners');

    $id('smartJiraConnect')?.addEventListener('click', function (e) {
        e.preventDefault(); smartJiraConnection();
    });

    $id('proceedToStories')?.addEventListener('click', function (e) {
        e.preventDefault(); loadJiraStories();
    });

    $id('jiraImportSelectedBtn')?.addEventListener('click', function (e) {
        e.preventDefault(); importSelectedJiraStories();
    });

    document.querySelectorAll('.jira-btn-cancel').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault(); hideJiraImportModal();
        });
    });

    document.querySelectorAll('#jiraImportModal .close-button').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault(); hideJiraImportModal();
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

