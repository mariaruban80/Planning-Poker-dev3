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
    if (el) el.style.display = show ? 'flex' : 'none'; // Use flex for better centering
    const tableWrapper = document.querySelector('.jira-stories-table-wrapper');
    if (tableWrapper) tableWrapper.style.display = show ? 'none' : 'block'; // Hide table while loading
}


function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[ch]);
}



// --- Connection Functions ---

async function testAnonymousAccess(jiraUrl, projectKey) {
    // ... (Your existing code)
}


async function testJiraConnectionWithToken(url, email, token, project) {
    // ... (Your existing code)
}

async function smartJiraConnection() {
    // ... (Your existing code)
}

// --- Core JIRA Functions ---

async function performJiraSearch() {
  // ... (Your existing code)
}

function applyJiraFilters() {
    // ... existing code
}

function setupJiraCheckboxLogic() {
    // ... (Your existing code)
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


    populateFilterDropdowns(stories); //Call the populateFilterDropdowns
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

        rows.push(row);  // Store rows to append later for performance.
        tableBody.appendChild(row);
    });


        // Attach event listeners to the input checkbox element inside the table header cell
        const selectColumn = tableBody.querySelector('.select-column input[type="checkbox"]');
        if (selectColumn) {
            selectColumn.addEventListener('click', function() {
                const checkboxes = document.querySelectorAll('.jira-story-checkbox');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = this.checked;
                });
                updateSelectionState(); // Call updateSelectionState after updating checkboxes
            });
        }

        // Attach event listeners for rows (toggle style between regular and selected)
        rows.forEach(row => {
            row.addEventListener('click', (e) => {

                const cell = row.querySelector('.checkbox-cell');   
                const checkbox = cell.querySelector('input[type="checkbox"]');


                checkbox.checked = !checkbox.checked; // Toggle checkbox
                updateSelectionState(); // Update visual status

              if (checkbox.checked) {
                row.classList.add("selected");
              } else {
                row.classList.remove("selected");
              }

                updateSelectionState(); // Update selection count at the end of actions
            });
        });

    // Update selection count display
    function updateSelectionState() {


        const anyChecked = [...document.querySelectorAll('.jira-story-checkbox')].some(cb => cb.checked);  // Check some not all


        const selectedCount = document.querySelectorAll('.jira-story-checkbox:checked').length;
        selectedCountEl && (selectedCountEl.textContent = selectedCount + ' selected');


        const importSelectedStoriesBtn = document.getElementById("importSelectedStories");
        if (importSelectedStoriesBtn) importSelectedStoriesBtn.disabled = selectedCount === 0;
    };


    setupJiraCheckboxLogic(); // Call setupJiraCheckboxLogic after the stories loaded to tbody
    setupJiraFiltering();
}



// --- Utility Functions ---

async function loadJiraStories() {
    if (!jiraConnection) {
        showConnectionStatus('error', 'No active JIRA connection');
        return;
    }

    showJiraLoadingIndicator(true);  //Show the Loading indicator

    try {
        const baseUrl = jiraConnection.url.endsWith('/') ? jiraConnection.url.slice(0, -1) : jiraConnection.url;
        const jqlInput = $id('jiraJql');    
        const jql = jqlInput && jqlInput.value ? jqlInput.value : undefined;


        const response = await fetch('/api/jira/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl: baseUrl, email: jiraConnection.email, token: jiraConnection.token, projectKey: jiraConnection.project, ...(jql ? { jql } : {}) })
        });

        showJiraLoadingIndicator(false); //Hide the loading indicator

        if (response.ok) {
            const data = await response.json();
            const issues = data?.issues || [];  //Error handling

            jiraStories = issues.map(issue => {
                return {
                    key: issue.key, summary: issue.fields?.summary || '',   description: extractDescription(issue.fields?.description),  issueType: issue.fields?.issuetype?.name || 'Unknown', status: issue.fields?.status?.name || 'Unknown',  priority: issue.fields?.priority?.name || 'Medium',   assignee: issue.fields?.assignee?.displayName || null,    storyPoints: issue.fields?.customfield_10016 || null,   url: (jiraConnection.url || '').replace(/\/$/, '') + '/browse/' + issue.key
                };
            });

            displayJiraStories(jiraStories);

            $id('jiraConnectionStep')?.classList.remove('active');
            $id('jiraSelectionStep')?.classList.add('active');




        } else {
            showConnectionStatus('error', `Failed to load stories: HTTP ${response.status}`);
        }



    } catch (error) {
        showJiraLoadingIndicator(false); //Hide the loading indicator in case of error
        console.error('Failed to load JIRA stories:', error);
        showConnectionStatus('error', 'Failed to load stories. Please check your connection.');
    }
}



//Populate the filter dropdowns to include the filter by the status and issue type

function populateFilterDropdowns(stories) {
    console.log("populateFilterDropdowns called");
    const statusFilter = document.getElementById('jiraStatusFilter');
    const typeFilter = document.getElementById('jiraTypeFilter');


    if (statusFilter) {
        //Clear the filter options
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

    $id('jiraBackBtn')?.addEventListener('click', function (e) {
        e.preventDefault(); backToJiraConnection();
    });


    // --- JQL Search and Filtering ---


    const jiraSearchBtn = $id('jiraSearchBtn');
    jiraSearchBtn?.addEventListener('click', performJiraSearch);


    const jiraJqlInput = $id('jiraJqlInput');
    jiraJqlInput?.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault(); performJiraSearch();
        }
    });

});

// --- Expose Functions ---
window.JiraIntegration = {
    initializeJiraIntegration, showJiraImportModal, hideJiraImportModal, backToJiraConnection, smartJiraConnection, loadJiraStories, resetJiraModal, importSelectedJiraStories, toggleSelectAllJiraStories
};
