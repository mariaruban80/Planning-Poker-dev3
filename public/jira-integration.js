// -------------------- JIRA Integration --------------------

let jiraConnection = null;
let jiraStories = [];

// Show the JIRA import modal
function showJiraImportModal() {
  document.getElementById('jiraImportModal').style.display = 'block';
}

// Hide the modal
function hideJiraImportModal() {
  document.getElementById('jiraImportModal').style.display = 'none';
}

// Go back to the connection step
function backToJiraConnection() {
  document.getElementById('jiraConnectionStep').classList.add('active');
  document.getElementById('jiraSelectionStep').classList.remove('active');
}

// Reset the JIRA modal completely
function resetJiraModal() {
  jiraConnection = null;
  jiraStories = [];
  document.getElementById('jiraUrl').value = '';
  document.getElementById('jiraEmail').value = '';
  document.getElementById('jiraToken').value = '';
  document.getElementById('jiraProject').value = '';
  document.getElementById('jiraConnectionStep').classList.add('active');
  document.getElementById('jiraSelectionStep').classList.remove('active');
  hideJiraImportModal();
}

// Save credentials to local storage
function saveJiraCredentials() {
  const creds = {
    url: document.getElementById('jiraUrl').value.trim(),
    email: document.getElementById('jiraEmail').value.trim(),
    token: document.getElementById('jiraToken').value.trim(),
    project: document.getElementById('jiraProject').value.trim()
  };
  localStorage.setItem('jiraCredentials', JSON.stringify(creds));
}

// Extract description text safely
function extractDescription(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (desc.content) {
    return desc.content.map(block =>
      block.content ? block.content.map(c => c.text || '').join(' ') : ''
    ).join('\n');
  }
  return '';
}

// Show a status message inside modal
function showConnectionStatus(type, message) {
  const el = document.getElementById('jiraConnectionStatus');
  el.textContent = message;
  el.className = type; // success / error
}

// Show or hide loading spinner
function showJiraLoadingIndicator(show) {
  const el = document.getElementById('jiraLoadingIndicator');
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

// Smart connection flow (tries anon, then token)
async function smartJiraConnection() {
  const url = document.getElementById('jiraUrl').value.trim();
  const project = document.getElementById('jiraProject').value.trim();
  const email = document.getElementById('jiraEmail').value.trim();
  const token = document.getElementById('jiraToken').value.trim();

  showConnectionStatus('info', 'Testing connection...');

  const anon = await testAnonymousAccess(url, project);
  if (anon.success && !anon.requiresAuth) {
    showConnectionStatus('success', `Connected anonymously to "${anon.projectName}" 🎉`);
    jiraConnection = { url, email: null, token: null, project, isAnonymous: true };
    document.getElementById('proceedToStories').disabled = false;
    return;
  }

  if (email && token) {
    await testJiraConnectionWithToken(url, email, token, project);
  } else {
    showConnectionStatus('error', 'Authentication required. Please enter email & token.');
  }
}

// -----------------------------------------------------------
// Load stories via proxy and push them into Planning Poker
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

      // ✅ Push stories into Planning Poker board
      jiraStories.forEach(story => {
        const storyObj = {
          title: `${story.key}: ${story.summary}`,
          description: story.description,
          source: 'jira',
          jiraKey: story.key
        };

        if (typeof addStoryFromObject === 'function') {
          addStoryFromObject(storyObj, true); // true = broadcast to server
        } else {
          console.warn('[JIRA] addStoryFromObject not available, story not added to board');
        }
      });

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

// Display the fetched stories in UI
function displayJiraStories(stories) {
  const container = document.getElementById('jiraStoriesList');
  container.innerHTML = '';
  stories.forEach(story => {
    const div = document.createElement('div');
    div.className = 'jira-story';
    div.innerHTML = `<strong>${story.key}</strong>: ${story.summary}`;
    container.appendChild(div);
  });
}

// -----------------------------------------------------------
// Initialization (hook menu button, etc.)
function initializeJiraIntegration() {
  console.log('[JIRA] Initializing JIRA integration module');

  const isHost = (typeof isCurrentUserHost === 'function')
    ? isCurrentUserHost()
    : sessionStorage.getItem('isHost') === 'true';

  if (!isHost) {
    console.log('[JIRA] User is guest - hiding JIRA import');
    return;
  }

  function createJiraButton() {
    if (document.getElementById('jiraImportMenuBtn')) return null;

    const btn = document.createElement('button');
    btn.className = 'profile-menu-item';
    btn.id = 'jiraImportMenuBtn';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="menu-icon">
        <path d="M11.53 2c0 2.4 1.97 4.37 4.37 4.37h.1v.1c0 2.4 1.97 4.37 4.37 4.37V2H11.53zM2 11.53c2.4 0 4.37 1.97 4.37 4.37v.1h.1c2.4 0 4.37 1.97 4.37 4.37H2V11.53z"/>
      </svg>
      Import from JIRA
    `;
    btn.addEventListener('click', showJiraImportModal);
    return btn;
  }

  function injectButton() {
    const uploadBtn = document.getElementById('uploadTicketMenuBtn');
    const profileMenu = document.getElementById('profileMenu');
    const jiraBtn = createJiraButton();

    if (!jiraBtn) return; // already added

    if (uploadBtn && uploadBtn.parentNode) {
      uploadBtn.parentNode.insertBefore(jiraBtn, uploadBtn.nextSibling);
      console.log('[JIRA] Import from JIRA button inserted after CSV ✅');
    } else if (profileMenu) {
      profileMenu.appendChild(jiraBtn);
      console.warn('[JIRA] CSV not found, added to profile menu ⚠️');
    } else {
      console.log('[JIRA] Menu not ready yet, retrying...');
      return false;
    }
    return true;
  }

  // Immediate attempt
  if (injectButton()) return;

  // Retry with MutationObserver
  const observer = new MutationObserver(() => {
    if (injectButton()) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Hard fallback retry loop (10 tries)
  let attempts = 0;
  const interval = setInterval(() => {
    if (injectButton() || attempts++ > 10) clearInterval(interval);
  }, 500);
}




// Expose to window
window.JiraIntegration = {
  initializeJiraIntegration,
  showJiraImportModal,
  hideJiraImportModal,
  backToJiraConnection,
  smartJiraConnection,
  loadJiraStories,
  resetJiraModal
};
