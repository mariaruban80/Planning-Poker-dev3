
/* override.js
   This file overrides the story-card rendering functions so story cards show:
   - top-left story-id (from ticket.idDisplay)
   - below it the story description (from ticket.descriptionDisplay)
   - vote count bubble and estimate bubble on the right
   It is safe to include alongside your existing main.js; it replaces only two global functions.
*/

(function() {
  // Utility to strip HTML to plain text
  function stripHtml(htmlText) {
    if (!htmlText && htmlText !== "") return "";
    var tmp = document.createElement('div');
    tmp.innerHTML = htmlText;
    return tmp.textContent || tmp.innerText || "";
  }

  // Ensure there's a container for tickets
  function ensureStoryList() {
    var list = document.getElementById('storyList') || document.getElementById('storyContainer') || document.querySelector('.story-container');
    if (!list) {
      // fallback: create one inside .main
      var main = document.querySelector('.main') || document.body;
      list = document.createElement('div');
      list.id = 'storyList';
      list.className = 'story-container';
      main.prepend(list);
    }
    return list;
  }

  // Normalize story indexes (safe reflow helper)
  function normalizeStoryIndexes() {
    var list = ensureStoryList();
    var cards = list.querySelectorAll('.story-card');
    cards.forEach(function(card, idx) {
      card.dataset.index = idx;
    });
  }

  // Build the DOM structure for a story card
  function buildStoryCard(ticket) {
    var id = ticket.id || ('story_' + Date.now());
    var idDisplay = ticket.idDisplay || ticket.dataId || ticket.name || '';
    var descriptionHTML = ticket.descriptionDisplay || ticket.description || ticket.text || '';
    var descriptionText = stripHtml(descriptionHTML).trim();

    var card = document.createElement('div');
    card.className = 'story-card';
    card.id = id;

    // Left section (id label + description)
    var left = document.createElement('div');
    left.className = 'left';

    var idEl = document.createElement('div');
    idEl.className = 'story-id';
    idEl.title = idDisplay || '';
    idEl.textContent = idDisplay || '';

    var descEl = document.createElement('div');
    descEl.className = 'story-description';
    descEl.title = descriptionText || '';
    descEl.textContent = descriptionText || '';

    left.appendChild(idEl);
    left.appendChild(descEl);

    // Meta section (vote bubble + estimate)
    var meta = document.createElement('div');
    meta.className = 'story-meta';

    var voteBubble = document.createElement('div');
    voteBubble.className = 'vote-bubble';
    voteBubble.id = 'vote-bubble-' + id;
    voteBubble.textContent = '?'; // default until votes are received

    var estimateBubble = document.createElement('div');
    estimateBubble.className = 'estimate-bubble';
    estimateBubble.id = 'estimate-bubble-' + id;
    estimateBubble.textContent = ''; // filled when estimate exists

    meta.appendChild(voteBubble);
    meta.appendChild(estimateBubble);

    card.appendChild(left);
    card.appendChild(meta);

    // click handler to select story (keeps existing behavior if present)
    card.addEventListener('click', function(e) {
      try {
        // if main app provided a selectStory or setCurrentStory function, call it
        if (typeof window.selectStory === 'function') {
          window.selectStory(id);
        } else if (typeof window.setCurrentStory === 'function') {
          window.setCurrentStory(id);
        } else {
          // fallback: toggle selected class
          document.querySelectorAll('.story-card.selected').forEach(function(c){ c.classList.remove('selected'); });
          card.classList.add('selected');
        }
      } catch (err) {
        console.warn('select click handling error', err);
      }
    });

    return card;
  }

  // Override global addTicketToUI
  window.addTicketToUI = function(ticket, skipSelect) {
    try {
      var list = ensureStoryList();
      if (!ticket || !ticket.id) {
        ticket = ticket || {};
        ticket.id = 'story_' + Date.now();
      }

      // prevent duplicate if exists
      if (document.getElementById(ticket.id)) {
        // update instead
        if (typeof window.updateTicketInUI === 'function') {
          window.updateTicketInUI(ticket);
        }
        return;
      }

      var card = buildStoryCard(ticket);
      // append to list (end)
      list.appendChild(card);
      normalizeStoryIndexes();

      // If there is stored vote-count info, show it
      if (window.votesPerStory && window.votesPerStory[ticket.id]) {
        var count = Object.keys(window.votesPerStory[ticket.id]).length;
        var bubble = document.getElementById('vote-bubble-' + ticket.id);
        if (bubble) bubble.textContent = count > 0 ? count.toString() : '?';
      }

      if (!skipSelect) {
        // try to focus/select the card
        card.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      }

    } catch (err) {
      console.error('addTicketToUI error', err);
    }
  };

  // Override global updateTicketInUI
  window.updateTicketInUI = function(ticketData) {
    try {
      if (!ticketData || !ticketData.id) return;
      var card = document.getElementById(ticketData.id);
      if (!card) {
        // if not present, add it
        window.addTicketToUI(ticketData, true);
        card = document.getElementById(ticketData.id);
        if (!card) return;
      }

      var idDisplay = ticketData.idDisplay || ticketData.dataId || '';
      var descriptionHTML = ticketData.descriptionDisplay || ticketData.description || ticketData.text || '';
      var plainDesc = stripHtml(descriptionHTML).trim();

      var idEl = card.querySelector('.story-id');
      var descEl = card.querySelector('.story-description');

      if (idEl) {
        idEl.textContent = idDisplay || '';
        idEl.title = idDisplay || '';
      }
      if (descEl) {
        descEl.textContent = plainDesc || '';
        descEl.title = plainDesc || '';
      }

      // Update vote bubble if server-side votes exist
      if (window.votesPerStory && window.votesPerStory[ticketData.id]) {
        var count = Object.keys(window.votesPerStory[ticketData.id]).length;
        var bubble = document.getElementById('vote-bubble-' + ticketData.id);
        if (bubble) bubble.textContent = count > 0 ? count.toString() : '?';
      }

      // If ticketData has a numericEstimate or estimate property, populate estimate bubble
      var estimateVal = ticketData.estimate || ticketData.numericEstimate || ticketData.aiEstimate || '';
      var estimateEl = document.getElementById('estimate-bubble-' + ticketData.id);
      if (estimateEl) {
        estimateEl.textContent = estimateVal ? estimateVal.toString() : '';
      }

    } catch (err) {
      console.error('updateTicketInUI error', err);
    }
  };

  // small helper: refresh vote counts for all visible tickets
  window.refreshAllVoteBubbles = function() {
    try {
      if (!window.votesPerStory) return;
      for (var storyId in window.votesPerStory) {
        var el = document.getElementById('vote-bubble-' + storyId);
        if (el) {
          var count = Object.keys(window.votesPerStory[storyId] || {}).length;
          el.textContent = count > 0 ? count.toString() : '?';
        }
      }
    } catch (e) { console.warn(e); }
  };

  // Run a small reflow after load to patch existing story cards
  window.addEventListener('load', function() {
    // Convert any existing .story-card elements (that may have .story-title) to the new layout
    var existing = document.querySelectorAll('.story-card');
    existing.forEach(function(oldCard) {
      // skip if already patched (contains .story-id)
      if (oldCard.querySelector('.story-id')) return;
      try {
        var id = oldCard.id || ('story_' + Date.now());
        var titleText = (oldCard.querySelector('.story-title')?.textContent) || oldCard.textContent || '';
        var dataId = oldCard.dataset?.id || '';
        var dataDesc = oldCard.dataset?.description || '';

        var ticket = { id: id, idDisplay: dataId || '', descriptionDisplay: dataDesc || titleText };
        var newCard = buildStoryCard(ticket);
        oldCard.replaceWith(newCard);
      } catch (err) { /* ignore */ }
    });

    // run vote bubble refresh in case votes were already loaded
    setTimeout(window.refreshAllVoteBubbles, 400);
  });

})();
