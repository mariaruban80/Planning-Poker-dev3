<script>
// Mobile layout script to match desktop view
document.addEventListener('DOMContentLoaded', function() {
  // Check if mobile
  const isMobile = window.innerWidth <= 1024;
  if (isMobile) {
    applyDesktopLayoutToMobile();
  }
  
  // Handle resizes
  window.addEventListener('resize', function() {
    const isMobileNow = window.innerWidth <= 1024;
    if (isMobileNow && !document.getElementById('desktop-mobile-style')) {
      applyDesktopLayoutToMobile();
    }
  });
  
  function applyDesktopLayoutToMobile() {
    console.log('Applying desktop layout to mobile device');
    
    // Create style element
    const style = document.createElement('style');
    style.id = 'desktop-mobile-style';
    style.textContent = `
      /* Desktop layout for mobile devices */
      @media (max-width: 1024px) {
        /* Basic resets */
        body {
          overflow-x: hidden;
          margin: 0;
          padding: 0;
        }
        
        /* Main container setup */
        .container {
          display: flex !important;
          flex-direction: row !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          min-height: calc(100vh - 120px) !important;
          padding-bottom: 0 !important;
          width: 100% !important;
        }
        
        /* Header styling */
        header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: 15px 20px !important;
          background: white !important;
          border-bottom: 1px solid #f0f0f0 !important;
          position: sticky !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          z-index: 1000 !important;
          box-sizing: border-box !important;
        }
        
        /* Upload section */
        .upload-section {
          display: flex !important;
          justify-content: flex-end !important;
          padding: 10px 20px !important;
          background: white !important;
          border-bottom: 1px solid #f0f0f0 !important;
          position: sticky !important;
          top: 60px !important;
          left: 0 !important;
          width: 100% !important;
          z-index: 999 !important;
          box-sizing: border-box !important;
        }
        
        /* Left sidebar */
        .sidebar {
          min-width: 300px !important;
          width: 300px !important;
          padding: 15px 20px !important;
          box-sizing: border-box !important;
          background: white !important;
          border-right: 1px solid #f5f5f5 !important;
          flex-shrink: 0 !important;
        }
        
        .sidebar h3 {
          color: #673ab7 !important;
          font-size: 15px !important;
          text-transform: uppercase !important;
          font-weight: 600 !important;
          margin-top: 0 !important;
          margin-bottom: 15px !important;
        }
        
        #userList {
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
        }
        
        .user-entry {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding: 10px 0 !important;
          border-bottom: 1px solid #f5f5f5 !important;
        }
        
        .avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-weight: bold !important;
          font-size: 16px !important;
          color: white !important;
          margin-right: 12px !important;
        }
        
        .vote-badge {
          font-size: 18px !important;
          font-weight: bold !important;
          color: #673ab7 !important;
        }
        
        /* Control buttons */
        .controls-section {
          margin-top: 20px !important;
        }
        
        .button {
          border-radius: 30px !important;
          background: white !important;
          color: #673ab7 !important;
          border: 1px solid #673ab7 !important;
        }
        
        /* Main section */
        .main {
          flex: 1 !important;
          min-width: 600px !important;
          padding: 20px !important;
          box-sizing: border-box !important;
          background: white !important;
        }
        
        /* User circle & voting area */
        #userCircle {
          width: 100% !important;
          max-width: 100% !important;
          padding: 0 !important;
          margin-bottom: 20px !important;
        }
        
        .poker-table-layout {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 20px !important;
          width: 100% !important;
          max-width: 700px !important;
          margin: 0 auto !important;
        }
        
        .avatar-row, .vote-row {
          display: flex !important;
          justify-content: center !important;
          flex-wrap: wrap !important;
          gap: 50px !important;
          width: 100% !important;
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
          background-color: #f6ad55 !important;
          color: white !important;
          font-size: 24px !important;
          font-weight: bold !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          margin-bottom: 10px !important;
        }
        
        .vote-card-space {
          width: 60px !important;
          height: 85px !important;
          border: 1px dashed #ccc !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        
        .vote-card-space.has-vote {
          border: 1px solid #673ab7 !important;
          background-color: white !important;
        }
        
        .reveal-button-container {
          margin: 20px 0 !important;
        }
        
        .reveal-votes-button {
          text-transform: uppercase !important;
          padding: 12px 30px !important;
          background: white !important;
          color: #673ab7 !important;
          border: 2px solid #673ab7 !important;
          border-radius: 4px !important;
          font-weight: bold !important;
          font-size: 16px !important;
        }
        
        /* Planning cards */
        .planning-cards-section {
          width: 100% !important;
          max-width: 500px !important;
          margin: 30px auto 0 auto !important;
          padding: 10px !important;
          box-sizing: border-box !important;
          background: white !important;
        }
        
        .planning-cards-section h3 {
          color: #673ab7 !important;
          font-size: 16px !important;
          text-transform: uppercase !important;
          font-weight: 600 !important;
          text-align: center !important;
          margin-bottom: 20px !important;
        }
        
        .cards {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: flex-end !important;
          gap: 10px !important;
          padding: 10px !important;
        }
        
        .card {
          width: 60px !important;
          height: 60px !important;
          background-color: #e1d4f9 !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 18px !important;
          font-weight: bold !important;
          margin: 0 !important;
          color: #333 !important;
        }
        
        .card:hover, .card.selected-card {
          transform: translateY(-3px) !important;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
        }
        
        /* Right sidebar with story list */
        .rightbar {
          min-width: 350px !important;
          width: 350px !important;
          padding: 15px 20px !important;
          box-sizing: border-box !important;
          background: white !important;
          border-left: 1px solid #f5f5f5 !important;
          flex-shrink: 0 !important;
        }
        
        .add-ticket-btn {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          background: white !important;
          color: #673ab7 !important;
          border: 1px solid #673ab7 !important;
          border-radius: 30px !important;
          padding: 12px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          margin-bottom: 20px !important;
        }
        
        .story-container {
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
          max-height: 60vh !important;
          overflow-y: auto !important;
        }
        
        .story-card {
          padding: 15px !important;
          background: white !important;
          border: 1px solid #e0e0e0 !important;
          border-radius: 8px !important;
          margin-bottom: 10px !important;
          cursor: pointer !important;
        }
        
        .story-card.selected {
          background-color: #f9f5ff !important;
          border-color: #673ab7 !important;
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
          border-radius: 30px !important;
          padding: 10px !important;
          border-color: #673ab7 !important;
          color: #673ab7 !important;
        }
        
        /* Fix revealed votes display */
        .vote-statistics-container, .fixed-vote-display {
          margin: 20px auto !important;
        }
        
        .fixed-vote-display {
          background: white !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        /* Add card selection indicator */
        .selected-card {
          transform: translateY(-3px) !important;
          background-color: #d6bcfa !important;
          border: 1px solid #673ab7 !important;
        }
        
        /* Stats area */
        .fixed-vote-card {
          background-color: white !important;
          color: #333 !important;
          border: 1px solid #000 !important;
        }
        
        /* Own vote indicator */
        .own-vote-space {
          border: 2px dashed #673ab7 !important;
        }
        
        .own-vote-space::after {
          font-size: 12px !important;
          bottom: -18px !important;
        }
        
        /* Fix any overlapping content */
        body.votes-revealed .vote-badge {
          color: #673ab7 !important;
          font-size: 18px !important;
        }
      }
    `;
    
    document.head.appendChild(style);
    
    // Setup touch interactions
    setupTouchInteractions();
  }
  
  function setupTouchInteractions() {
    // Handle planning card touch
    document.querySelectorAll('.card').forEach(card => {
      // Remove any existing handlers
      const newCard = card.cloneNode(true);
      if (card.parentNode) {
        card.parentNode.replaceChild(newCard, card);
      }
      
      // Add touch handler
      newCard.addEventListener('touchend', function(e) {
        e.preventDefault();
        
        // Clear selection from all cards
        document.querySelectorAll('.card').forEach(c => {
          c.classList.remove('selected-card');
        });
        
        // Add selection to this card
        this.classList.add('selected-card');
        
        // Get vote value
        const vote = this.getAttribute('data-value');
        
        // Get current user
        const userName = sessionStorage.getItem('userName');
        if (!userName) return;
        
        // Find vote space
        const safeId = userName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
        const voteSpace = document.getElementById(`vote-space-${safeId}`);
        
        if (voteSpace) {
          // Mark as voted
          voteSpace.classList.add('has-vote');
          
          // Send vote
          if (typeof window.emitVote === 'function') {
            window.emitVote(vote, userName);
          } else if (window.socket) {
            window.socket.emit('castVote', { vote, targetUserId: userName });
          }
        }
      });
    });
    
    // Setup story card touch
    document.querySelectorAll('.story-card').forEach(card => {
      card.addEventListener('touchend', function(e) {
        // Skip if touching a button
        if (e.target.tagName.toLowerCase() === 'button') return;
        
        e.preventDefault();
        
        // Clear selection from all stories
        document.querySelectorAll('.story-card').forEach(c => {
          c.classList.remove('selected');
        });
        
        // Add selection to this story
        this.classList.add('selected');
        
        // Get story index
        const index = parseInt(this.dataset.index || '0', 10);
        
        // Send to server
        if (window.socket) {
          window.socket.emit('storySelected', { storyIndex: index });
        }
      });
    });
  }
});
</script>
