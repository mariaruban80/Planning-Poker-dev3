// mobile-layout.js
// Script to optimize Planning Poker layout for mobile devices

document.addEventListener('DOMContentLoaded', function() {
  // Only apply on mobile devices
  const isMobile = window.innerWidth <= 1024;
  if (isMobile) {
    applyMobileLayout();
  }
  
  // Also handle window resizes
  window.addEventListener('resize', function() {
    const isMobile = window.innerWidth <= 1024;
    if (isMobile && !document.getElementById('mobile-layout-style')) {
      applyMobileLayout();
    }
  });
  
  function applyMobileLayout() {
    console.log("Applying mobile layout to match desktop view");
    
    // Create style element for mobile layout
    const style = document.createElement('style');
    style.id = 'mobile-layout-style';
    style.textContent = `
      /* Mobile layout CSS to match desktop */
      @media (max-width: 1024px) {
        /* Container layout */
        .container {
          display: flex !important;
          flex-direction: row !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          scroll-snap-type: x mandatory !important;
          min-height: calc(100vh - 120px) !important;
        }
        
        /* Sidebar with current members */
        .sidebar {
          min-width: 300px !important;
          width: 300px !important;
          flex-shrink: 0 !important;
          scroll-snap-align: start !important;
          padding: 15px 20px !important;
          background: white !important;
          border-right: 1px solid #eee !important;
        }
        
        .sidebar h3 {
          color: #673ab7 !important;
          text-transform: uppercase !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          margin: 10px 0 20px 0 !important;
        }
        
        #userList {
          display: flex !important;
          flex-direction: column !important;
          gap: 15px !important;
        }
        
        .user-entry {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding-bottom: 10px !important;
          border-bottom: 1px solid #f5f5f5 !important;
        }
        
        .avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          margin-right: 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 16px !important;
          font-weight: bold !important;
          color: white !important;
        }
        
        .username {
          flex: 1 !important;
          font-weight: 500 !important;
          font-size: 14px !important;
        }
        
        .vote-badge {
          font-size: 18px !important;
          font-weight: bold !important;
          color: #673ab7 !important;
        }
        
        .controls-section {
          margin-top: 20px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }
        
        .controls-section .button {
          border-radius: 30px !important;
        }
        
        /* Main voting area */
        .main {
          min-width: 600px !important;
          flex: 1 !important;
          scroll-snap-align: start !important;
          padding: 20px !important;
          background: white !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
        }
        
        #userCircle {
          width: 100% !important;
          padding: 0 !important;
          margin-bottom: 30px !important;
        }
        
        .poker-table-layout {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          width: 100% !important;
          max-width: 600px !important;
          gap: 30px !important;
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
          text-align: center !important;
        }
        
        .vote-card-space {
          width: 60px !important;
          height: 90px !important;
          border: 1px dashed #ccc !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        
        .vote-card-space.has-vote {
          border: 1px solid #673ab7 !important;
        }
        
        .vote-card-space .vote-badge {
          font-size: 20px !important;
          color: #673ab7 !important;
        }
        
        .reveal-button-container {
          margin: 20px 0 !important;
        }
        
        .reveal-votes-button {
          text-transform: uppercase !important;
          font-weight: bold !important;
          background: white !important;
          color: #673ab7 !important;
          border: 2px solid #673ab7 !important;
          border-radius: 4px !important;
          padding: 12px 24px !important;
        }
        
        /* Stats display */
        .fixed-vote-display, .vote-statistics-display {
          margin: 20px auto !important;
          background: white !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        /* Planning cards */
        .planning-cards-section {
          width: 100% !important;
          max-width: 500px !important;
          margin-top: 30px !important;
          background: white !important;
        }
        
        .planning-cards-section h3 {
          color: #673ab7 !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          text-align: center !important;
          margin-bottom: 15px !important;
        }
        
        .cards {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: flex-end !important;
          gap: 10px !important;
          padding: 0 20px 20px 20px !important;
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
          color: #333 !important;
          margin: 0 !important;
        }
        
        .card:hover, .card.selected-card {
          transform: translateY(-3px) !important;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
        }
        
        /* Right sidebar with stories */
        .rightbar {
          min-width: 350px !important;
          width: 350px !important;
          flex-shrink: 0 !important;
          scroll-snap-align: start !important;
          padding: 15px 20px !important;
          background: white !important;
          border-left: 1px solid #eee !important;
        }
        
        .add-ticket-btn {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          padding: 10px !important;
          background: white !important;
          color: #673ab7 !important;
          border: 1px solid #673ab7 !important;
          border-radius: 30px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          margin-bottom: 20px !important;
        }
        
        .story-container {
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }
        
        .story-card {
          padding: 15px !important;
          margin-bottom: 10px !important;
          background: white !important;
          border: 1px solid #e0e0e0 !important;
          border-radius: 8px !important;
        }
        
        .story-card.selected {
          background-color: #f9f5ff !important;
          border-color: #673ab7 !important;
        }
        
        .story-title {
          font-size: 14px !important;
          line-height: 1.4 !important;
        }
        
        .navigation-buttons {
          display: flex !important;
          gap: 10px !important;
          margin-top: 20px !important;
        }
        
        .navigation-buttons .button {
          border-radius: 30px !important;
        }
        
        /* Fix stacking context for fixed elements */
        header {
          z-index: 1001 !important;
        }
        
        .upload-section {
          z-index: 1000 !important;
        }
      }
    `;
    
    document.head.appendChild(style);
    
    // Set up touch interactions for mobile
    setupTouchInteractions();
    
    console.log("Mobile layout applied successfully");
  }
  
  function setupTouchInteractions() {
    // Handle planning card touch events
    document.querySelectorAll('.card').forEach(card => {
      // Remove existing handlers by cloning the element
      const newCard = card.cloneNode(true);
      if (card.parentNode) {
        card.parentNode.replaceChild(newCard, card);
      }
      
      // Add touch handler
      newCard.addEventListener('touchend', function(e) {
        e.preventDefault();
        
        // Remove selection from all cards
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
          
          // Emit vote
          if (typeof window.emitVote === 'function') {
            window.emitVote(vote, userName);
          } else if (window.socket) {
            window.socket.emit('castVote', { vote, targetUserId: userName });
          }
        }
      });
    });
    
    // Handle story card touch events
    document.querySelectorAll('.story-card').forEach(card => {
      card.addEventListener('touchend', function(e) {
        if (e.target.tagName.toLowerCase() === 'button') return;
        
        e.preventDefault();
        
        // Remove selection from all stories
        document.querySelectorAll('.story-card').forEach(c => {
          c.classList.remove('selected');
        });
        
        // Add selection to this story
        this.classList.add('selected');
        
        // Get story index
        const index = parseInt(this.dataset.index || '0', 10);
        
        // Emit story selection
        if (window.socket) {
          window.socket.emit('storySelected', { storyIndex: index });
        }
      });
    });
  }
});
