// userlist-fix.js - Direct fix for user list display issues
(function() {
  console.log("[USERFIX] Loading user list fix");
  
  // Run immediately
  setTimeout(directUserFix, 1000);
  
  // And again after a delay
  setTimeout(directUserFix, 3000);
  
  // Run periodically
  setInterval(directUserFix, 10000);
  
  function directUserFix() {
    console.log("[USERFIX] Running direct user list fix");
    
    // 1. Get current username
    const userName = sessionStorage.getItem('userName');
    if (!userName) {
      console.log("[USERFIX] No username found in session storage");
      return;
    }
    
    // 2. Check user list container
    const userListContainer = document.getElementById('userList');
    if (!userListContainer) {
      console.log("[USERFIX] User list container not found");
      return;
    }
    
    // 3. Check if user list is empty
    if (userListContainer.children.length === 0) {
      console.log("[USERFIX] User list is empty, adding emergency user");
      
      // Create user entry
      const userEntry = document.createElement('div');
      userEntry.className = 'user-entry';
      userEntry.id = 'user-emergency';
      
      // Generate color based on username
      let color = '#673ab7'; // Default purple
      try {
        let hash = 0;
        for (let i = 0; i < userName.length; i++) {
          hash = userName.charCodeAt(i) + ((hash << 5) - hash);
        }
        color = '#';
        for (let i = 0; i < 3; i++) {
          const value = (hash >> (i * 8)) & 0xFF;
          color += ('00' + value.toString(16)).substr(-2);
        }
      } catch (err) {
        console.error("[USERFIX] Error generating color:", err);
      }
      
      // Get initials
      let initials = userName.charAt(0).toUpperCase();
      try {
        initials = userName
          .split(' ')
          .map(word => word[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);
      } catch (err) {
        console.error("[USERFIX] Error generating initials:", err);
      }
      
      // Set HTML content
      userEntry.innerHTML = `
        <div class="avatar" style="background-color: ${color}">
          ${initials}
        </div>
        <span class="username">${userName}</span>
        <span class="vote-badge">?</span>
      `;
      
      // Add to container
      userListContainer.appendChild(userEntry);
      console.log("[USERFIX] Added emergency user to list");
      
      // Also fix user circle if present
      fixUserCircle(userName, color, initials);
    }
  }
  
  function fixUserCircle(userName, color, initials) {
    const userCircle = document.getElementById('userCircle');
    if (!userCircle || userCircle.children.length > 0) return;
    
    console.log("[USERFIX] Adding emergency user to center area");
    
    try {
      // Create basic structure
      const layout = document.createElement('div');
      layout.className = 'poker-table-layout';
      
      // Create avatar row
      const avatarRow = document.createElement('div');
      avatarRow.className = 'avatar-row';
      
      // Create user container
      const avatarContainer = document.createElement('div');
      avatarContainer.className = 'avatar-container';
      avatarContainer.innerHTML = `
        <div class="avatar-circle" style="background-color: ${color}">
          ${initials}
        </div>
        <div class="user-name">${userName}</div>
      `;
      
      // Assemble
      avatarRow.appendChild(avatarContainer);
      layout.appendChild(avatarRow);
      
      // Add reveal button
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'reveal-button-container';
      const button = document.createElement('button');
      button.className = 'reveal-votes-button';
      button.textContent = 'REVEAL VOTES';
      buttonContainer.appendChild(button);
      layout.appendChild(buttonContainer);
      
      // Add to user circle
      userCircle.appendChild(layout);
      console.log("[USERFIX] Added emergency user to center area");
    } catch (err) {
      console.error("[USERFIX] Error fixing user circle:", err);
    }
  }
  
  // Export function to window for manual use
  window.directUserFix = directUserFix;
})();
