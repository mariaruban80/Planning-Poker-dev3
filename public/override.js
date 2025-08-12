
(function() {
  function stripHtml(htmlText) {
    if (!htmlText && htmlText !== "") return "";
    var tmp = document.createElement('div');
    tmp.innerHTML = htmlText;
    return tmp.textContent || tmp.innerText || "";
  }

  function patchCard(card, ticket) {
    let leftContainer = card.querySelector('.left');
    if (!leftContainer) {
      leftContainer = document.createElement('div');
      leftContainer.className = 'left';
      const titleEl = card.querySelector('.story-title');
      if (titleEl) leftContainer.appendChild(titleEl);
      card.insertBefore(leftContainer, card.firstChild);
    }

    // remove any existing id/description elements
    leftContainer.querySelectorAll('.story-id, .story-description').forEach(el => el.remove());

    // add id
    const idEl = document.createElement('div');
    idEl.className = 'story-id';
    idEl.textContent = ticket.idDisplay || '';
    idEl.title = ticket.idDisplay || '';
    leftContainer.insertBefore(idEl, leftContainer.firstChild);

    // add description
    const descEl = document.createElement('div');
    descEl.className = 'story-description';
    const descText = stripHtml(ticket.descriptionDisplay || '').trim();
    descEl.textContent = descText;
    descEl.title = descText;
    leftContainer.insertBefore(descEl, leftContainer.firstChild.nextSibling);
  }

  const origAdd = window.addTicketToUI;
  window.addTicketToUI = function(ticket, skipSelect) {
    origAdd.call(this, ticket, skipSelect);
    const card = document.getElementById(ticket.id);
    if (card) patchCard(card, ticket);
  };

  const origUpdate = window.updateTicketInUI;
  window.updateTicketInUI = function(ticket) {
    origUpdate.call(this, ticket);
    const card = document.getElementById(ticket.id);
    if (card) patchCard(card, ticket);
  };

  window.addEventListener('load', function() {
    document.querySelectorAll('.story-card').forEach(card => {
      const ticket = {
        idDisplay: card.dataset?.id || '',
        descriptionDisplay: card.dataset?.description || ''
      };
      patchCard(card, ticket);
    });
  });
})();
