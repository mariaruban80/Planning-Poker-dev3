<script>
document.addEventListener('DOMContentLoaded', function() {
  // Apply desktop layout to mobile
  if (window.innerWidth <= 1024) {
    applyDesktopLayoutToMobile();
  }
  
  // Also handle window resizes
  window.addEventListener('resize', function() {
    if (window.innerWidth <= 1024) {
      if (!document.getElementById('desktop-mobile-style')) {
        applyDesktopLayoutToMobile();
      }
    }
  });
  
  function applyDesktopLayoutToMobile() {
    console.log("Applying desktop layout to mobile");
    
    // Create style element
    const style = document.createElement('style');
    style.id = 'desktop-mobile-style';
    style.textContent = `
      /* Desktop layout for mobile */
      @media (max-width: 1024px) {
        body {
          overflow-x: hidden;
        }
        
        /* Container layout - preserve the three-column layout */
        .container {
          display: flex !important;
          flex-direction: row !important;
          min-height: calc(100vh - 120px) !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          overflow-x: auto !important; /* Allow horizontal scrolling */
          -webkit-overflow-scrolling: touch !important;
        }
        
        /* Sidebar with members */
        .sidebar {
          min-width: 250px !important;
          width: 250px !important;
          flex-shrink: 0 !important;
          padding: 15px !important;
          border-right: 1px solid #f0f0f0 !important;
          background: white !important;
          overflow-y: auto !important;
          height: calc(100vh - 120px) !important;
        }
        
        .sidebar h3 {
          color: #673ab7 !important;
          text-transform: uppercase !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          margin-bottom: 15px !important;
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
          padding: 10px 0 !important;
          border-bottom: 1px solid #f5f5f5 !important;
        }
        
        .avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          margin-right: 10px !important;
        }
        
        .username {
          font-weight: 500 !important;
          font-size: 14px !important;
          flex: 1 !important;
        }
        
        .vote-badge {
          font-weight: bold !important;
          font-size: 16px !important;
          color: #673ab7 !important;
        }
        
        /* Control buttons */
        .controls-section {
          margin-top: 20px !important;
        }
        
        .controls-section .button {
          margin-bottom: 10px !important;
          border-radius: 50px !important;
        }
        
        /* Main voting area */
        .main {
          flex: 1 !important;
          min-width: 600px !important;
          padding: 20px !important;
          overflow-y: auto !important;
          height: calc(100vh - 120px) !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: flex-start !important;
        }
        
        #userCircle {
          width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        .poker-table-layout {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 30px !important;
        }
        
        .avatar-row, .vote-row {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: center !important;
          gap: 40px !important;
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
          font-size: 24px !important;
          background-color: #f6ad55 !important;
        }
        
        .user-name {
          font-size: 14px !important;
          margin-top: 8px !important;
        }
        
        .vote-card-space {
          width: 70px !important;
          height: 100px !important;
          border: 1px dashed #ccc !important;
          border-radius: 8px !important;
        }
        
        .vote-card-space.has-vote {
          border: 1px solid #673ab7 !important;
        }
        
        /* Reveal button */
        .reveal-button-container {
          margin-top: 30px !important;
          margin-bottom: 30px !important;
        }
        
        .reveal-votes-button {
          text-transform: uppercase !important;
          padding: 12px 30px !important;
          border-radius: 4px !important;
        }
        
        /* Planning cards */
        .planning-cards-section {
          margin-top: 20px !important;
          width: 100% !important;
          max-width: 500px !important;
        }
        
        .planning-cards-section h3 {
          text-transform: uppercase !important;
          color: #673ab7 !important;
          text-align: center !important;
          margin-bottom: 15px !important;
          font-size: 16px !important;
        }
        
        .cards {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: flex-end !important;
          gap: 10px !important;
        }
        
        .card {
          width: 70px !important;
          height: 70px !important;
          background-color: #e9d8fd !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 20px !important;
          font-weight: bold !important;
        }
        
        .card:hover, .card.selected-card {
          transform: translateY(-3px) !important;
        }
        
        /* Story list */
        .rightbar {
          min-width: 350px !important;
          width: 350px !important;
          flex-shrink: 0 !important;
          padding: 20px !important;
          background: white !important;
          border-left: 1px solid #f0f0f0 !important;
          overflow-y: auto !important;
          height: calc(100vh - 120px) !important;
        }
        
        .add-ticket-btn {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 10px !important;
          background: white !important;
          color: #673ab7 !important;
          border: 1px solid #673ab7 !important;
          border-radius: 50px !important;
          margin-bottom: 20px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
        }
        
        .story-container {
          height: calc(100vh - 330px) !important;
          overflow-y: auto !important;
        }
        
        .story-card {
          margin-bottom: 10px !important;
          padding: 15px !important;
          background: white !important;
          border: 1px solid #e0e0e0 !important;
          border-radius: 8px !important;
        }
        
        .story-card.selected {
          background: #f9f5ff !important;
          border-color: #673ab7 !important;
        }
        
        .story-title {
          font-size: 14px !important;
          line-height: 1.4 !important;
        }
        
        .navigation-buttons {
          margin-top: 20px !important;
          display: flex !important;
          gap: 10px !important;
        }
        
        .navigation-buttons .button {
          border-radius: 50px !important;
          padding: 10px !important;
        }
        
        /* Stats display */
        .vote-statistics-container {
          margin: 20px auto !important;
        }
        
        /* Make sure upload section is visible */
        .upload-section {
          display: flex !important;
          justify-content: flex-end !important;
          padding: 10px 20px !important;
          background: white !important;
        }
        
        /* Ensure proper header */
        header {
          padding: 15px 20px !important;
          background-color: white !important;
        }
      }
    `;
    
    document.head.appendChild(style);
    
    // Add touch handling for mobile
    setupMobileTouchHandling();
  }
  
  function setupMobileTouchHandling() {
    // Card selection via touch
    const cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
      // Remove existing handlers
      const newCard = card.cloneNode(true);
      if (card.parentNode) {
        card.parentNode.replaceChild(newCard, card);
      }
      
      // Add touch handler
      newCard.addEventListener('touchend', function(e) {
        e.preventDefault();
        
        // Clear selections
        document.querySelectorAll('.card').forEach(c => {
          c.classList.remove('selected-card');
        });
        
        // Select this card
        this.classList.add('selected-card');
        
        // Get vote value
        const vote = this.getAttribute('data-value');
        const userName = sessionStorage.getItem('userName');
        
        // Submit vote
        if (userName && window.socket) {
          window.socket.emit('castVote', { vote, targetUserId: userName });
        }
      });
    });
    
    // Make story cards work with touch
    const storyCards = document.querySelectorAll('.story-card');
    
    storyCards.forEach(card => {
      card.addEventListener('touchend', function(e) {
        if (!e.target.closest('button')) {
          e.preventDefault();
          
          // Clear selections
          document.querySelectorAll('.story-card').forEach(c => {
            c.classList.remove('selected');
          });
          
          // Select this card
          this.classList.add('selected');
          
          // Get index
          const index = this.dataset.index;
          if (index && window.socket) {
            window.socket.emit('storySelected', { storyIndex: parseInt(index) });
          }
        }
      });
    });
  }
});
</script>
