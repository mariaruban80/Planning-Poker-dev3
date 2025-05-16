<script>
document.addEventListener('DOMContentLoaded', function() {
  // Check if on mobile
  if (window.innerWidth <= 1024) {
    applyDesktopLayoutToMobile();
  }
  
  // Also handle window resize
  window.addEventListener('resize', function() {
    if (window.innerWidth <= 1024 && !document.getElementById('desktop-layout-on-mobile')) {
      applyDesktopLayoutToMobile();
    }
  });
  
  function applyDesktopLayoutToMobile() {
    console.log("Applying desktop layout to mobile devices");
    
    // Create style element for desktop-on-mobile layout
    const style = document.createElement('style');
    style.id = 'desktop-layout-on-mobile';
    style.textContent = `
      /* Desktop layout adapted for mobile */
      @media (max-width: 1024px) {
        /* Basic reset */
        body {
          overflow-x: hidden;
          background: white;
          padding-bottom: 0 !important;
          margin: 0;
        }
        
        /* Container layout - make it a grid instead of flex */
        .container {
          display: grid !important;
          grid-template-columns: 1fr 350px !important;
          grid-template-rows: auto 1fr !important;
          grid-template-areas:
            "header header"
            "main right"
            "sidebar right" !important;
          min-height: calc(100vh - 120px) !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
        }
        
        /* Header styling to match desktop */
        header {
          grid-area: header !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: 10px 20px !important;
          background: white !important;
          border-bottom: 1px solid #f0f0f0 !important;
          height: auto !important;
          position: sticky !important;
          top: 0 !important;
          z-index: 1000 !important;
        }
        
        .logo {
          display: flex !important;
          align-items: center !important;
        }
        
        .logo img {
          width: 32px !important;
          height: 32px !important;
          margin-right: 10px !important;
        }
        
        .logo span {
          font-size: 18px !important;
          font-weight: bold !important;
          color: #000 !important;
        }
        
        /* User display in header */
        .current-user-display {
          display: flex !important;
          align-items: center !important;
          margin-right: 10px !important;
        }
        
        #headerUserAvatar, .user-avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          margin-right: 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-weight: bold !important;
          color: white !important;
        }
        
        #logOffBtn {
          display: flex !important;
          align-items: center !important;
          color: #673ab7 !important;
          font-weight: bold !important;
          border: none !important;
          background: transparent !important;
          cursor: pointer !important;
          padding: 0 !important;
          font-size: 16px !important;
        }
        
        /* Upload and invite buttons */
        .upload-section {
          display: flex !important;
          justify-content: flex-end !important;
          padding: 10px 20px !important;
          background: white !important;
          position: sticky !important;
          top: 60px !important;
          z-index: 999 !important;
          border-bottom: 1px solid #f0f0f0 !important;
        }
        
        .upload-right {
          display: flex !important;
          gap: 10px !important;
        }
        
        .file-button, .invite-button {
          padding: 8px 16px !important;
          background: white !important;
          color: #673ab7 !important;
          border: 1px solid #673ab7 !important;
          border-radius: 20px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          cursor: pointer !important;
        }
        
        /* Sidebar with current members */
        .sidebar {
          grid-area: sidebar !important;
          width: 100% !important;
          padding: 15px !important;
          background: white !important;
          overflow-y: auto !important;
          border: none !important;
        }
        
        .sidebar h3 {
          color: #673ab7 !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          margin-bottom: 15px !important;
          text-transform: uppercase !important;
        }
        
        #userList {
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }
        
        .user-entry {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          background: white !important;
          padding: 10px 0 !important;
          border-bottom: 1px solid #f5f5f5 !important;
        }
        
        .avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          margin-right: 15px !important;
        }
        
        /* Control buttons in sidebar */
        .controls-section {
          margin-top: 20px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }
        
        .button {
          background: white !important;
          color: #673ab7 !important;
          border: 1px solid #673ab7 !important;
          border-radius: 4px !important;
          padding: 10px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          text-align: center !important;
        }
        
        /* Main section with voting UI */
        .main {
          grid-area: main !important;
          padding: 20px !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          background: white !important;
          overflow-y: auto !important;
        }
        
        #userCircle {
          width: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          padding: 20px 0 !important;
        }
        
        .poker-table-layout {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 30px !important;
          width: 100% !important;
        }
        
        /* Avatar row and vote row */
        .avatar-row, .vote-row {
          display: flex !important;
          justify-content: center !important;
          gap: 70px !important;
          width: 100% !important;
          flex-wrap: wrap !important;
        }
        
        .avatar-container {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
        }
        
        .avatar-circle {
          width: 70px !important;
          height: 70px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 24px !important;
          font-weight: bold !important;
          color: white !important;
          margin-bottom: 5px !important;
        }
        
        .user-name {
          font-size: 14px !important;
          font-weight: 500 !important;
        }
        
        .vote-card-space {
          width: 60px !important;
          height: 80px !important;
          border: 1px dashed #ccc !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: white !important;
          font-size: 20px !important;
          font-weight: bold !important;
          color: #673ab7 !important;
        }
        
        .vote-card-space.has-vote {
          border: 1px solid #673ab7 !important;
        }
        
        .reveal-votes-button, 
        .button#revealVotesBtn {
          padding: 10px 30px !important;
          background: white !important;
          color: #673ab7 !important;
          border: 2px solid #673ab7 !important;
          border-radius: 4px !important;
          font-size: 16px !important;
          font-weight: bold !important;
          cursor: pointer !important;
          text-transform: uppercase !important;
          margin: 20px 0 !important;
        }
        
        /* Stats area */
        .stats-area {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          margin: 30px 0 !important;
          width: 100% !important;
        }
        
        .stats-row {
          display: flex !important;
          align-items: center !important;
          margin-bottom: 20px !important;
        }
        
        .stats-label {
          font-size: 18px !important;
          color: #666 !important;
          margin-right: 10px !important;
        }
        
        .stats-value {
          font-size: 24px !important;
          font-weight: bold !important;
          color: #000 !important;
        }
        
        /* Right sidebar with stories */
        .rightbar {
          grid-area: right !important;
          width: 350px !important;
          padding: 20px !important;
          background: white !important;
          border-left: 1px solid #f0f0f0 !important;
          overflow-y: auto !important;
          height: calc(100vh - 120px) !important;
          position: fixed !important;
          right: 0 !important;
          top: 120px !important;
        }
        
        .add-ticket-btn {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: white !important;
          color: #673ab7 !important;
          border: 1px solid #673ab7 !important;
          border-radius: 20px !important;
          padding: 10px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          cursor: pointer !important;
          margin-bottom: 20px !important;
          width: 100% !important;
        }
        
        .story-container {
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
          max-height: calc(100vh - 300px) !important;
          overflow-y: auto !important;
        }
        
        .story-card {
          padding: 15px !important;
          background: white !important;
          border: 1px solid #e0e0e0 !important;
          border-radius: 8px !important;
          cursor: pointer !important;
        }
        
        .story-card.selected {
          border-color: #673ab7 !important;
          background-color: #f9f5ff !important;
        }
        
        .story-title {
          font-size: 14px !important;
          line-height: 1.4 !important;
          color: #333 !important;
        }
        
        .navigation-buttons {
          margin-top: 20px !important;
          display: flex !important;
          gap: 10px !important;
        }
        
        .navigation-buttons .button {
          flex: 1 !important;
          border-radius: 20px !important;
          text-align: center !important;
        }
        
        /* Planning cards section */
        .planning-cards-section {
          padding: 15px 0 !important;
          max-width: 600px !important;
          margin: 0 auto !important;
          display: block !important;
          background: white !important;
        }
        
        .planning-cards-section h3 {
          color: #673ab7 !important;
          text-transform: uppercase !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          text-align: center !important;
          margin-bottom: 15px !important;
        }
        
        .cards {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: flex-end !important;
          gap: 10px !important;
          padding: 0 !important;
        }
        
        .card {
          width: 70px !important;
          height: 70px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: #e9d8fd !important;
          border-radius: 8px !important;
          font-size: 18px !important;
          font-weight: bold !important;
          cursor: pointer !important;
          color: #333 !important;
        }
        
        .card:hover, .card.selected-card {
          transform: translateY(-3px) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
        }
      }
    `;
    
    document.head.appendChild(style);
    
    // Make the container layout match the desktop grid
    restructureLayout();
    
    // Setup touch handling for cards
    setupTouchHandling();
  }
  
  // Restructure the layout to match desktop
  function restructureLayout() {
    const container = document.querySelector('.container');
    if (!container) return;
    
    // Ensure rightbar is at the end of container
    const rightbar = document.querySelector('.rightbar');
    if (rightbar && container) {
      container.appendChild(rightbar);
    }
    
    // Make sure planning cards are in the main section
    const planningCards = document.querySelector('.planning-cards-section');
    if (planningCards) {
      const main = document.querySelector('.main');
      if (main) {
        main.appendChild(planningCards);
      }
    }
    
    // Make sure any fixed or absolute positioned elements are reset
    resetFixedElements();
  }
  
  // Reset any fixed positioning that might interfere
  function resetFixedElements() {
    // Check for any fixed card panels that aren't part of the original layout
    const fixedPanels = document.querySelectorAll('.card-panel, .fixed-panel, .mobile-card-panel');
    fixedPanels.forEach(panel => {
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    });
    
    // Reset planning cards section if it was moved
    const planningCards = document.querySelector('.planning-cards-section');
    if (planningCards) {
      planningCards.style.position = 'static';
      planningCards.style.bottom = 'auto';
      planningCards.style.left = 'auto';
      planningCards.style.width = '100%';
    }
  }
  
  // Setup touch handling for planning cards
  function setupTouchHandling() {
    const cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
      // Clear existing touch handlers
      const newCard = card.cloneNode(true);
      if (card.parentNode) {
        card.parentNode.replaceChild(newCard, card);
      }
      
      // Add new touch handler
      newCard.addEventListener('touchend', function(e) {
        e.preventDefault();
        
        // Clear selections from other cards
        document.querySelectorAll('.card').forEach(c => {
          c.classList.remove('selected-card');
        });
        
        // Select this card
        this.classList.add('selected-card');
        
        // Get current user name
        const userName = sessionStorage.getItem('userName');
        if (!userName) return;
        
        // Get vote value
        const vote = this.getAttribute('data-value');
        
        // Find the user's vote space
        const safeId = userName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
        const voteSpace = document.getElementById(`vote-space-${safeId}`);
        
        if (voteSpace) {
          // Mark as voted
          voteSpace.classList.add('has-vote');
          
          // Emit vote through existing functions
          if (typeof window.emitVote === 'function') {
            window.emitVote(vote, userName);
          } else if (typeof window.socket !== 'undefined') {
            window.socket.emit('castVote', { vote, targetUserId: userName });
          }
        }
      });
    });
  }
});
</script>
