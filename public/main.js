
// === main.js ===
// [Includes fixes for: storyId-based voting, UI cleanup, stats display, vote isolation]

import {
  initializeWebSocket,
  emitVote,
  revealVotes,
  requestStoryVotes,
  getCurrentStoryId
} from './socket.js';

let socket = null;
let userName = sessionStorage.getItem('userName');
let roomId = new URLSearchParams(window.location.search).get('roomId') || '';
let currentStoryId = null;
let votesPerStory = {};
let votesRevealed = {};

function setup() {
  if (!userName || !roomId) {
    userName = prompt('Enter your name:');
    sessionStorage.setItem('userName', userName);
  }
  socket = initializeWebSocket(roomId, userName, handleSocketMessage);
  setupVoteButtons();
}

function setupVoteButtons() {
  const voteButtons = document.querySelectorAll('.card');
  voteButtons.forEach(button => {
    button.addEventListener('click', () => {
      emitVote(button.dataset.value, userName);
    });
  });

  const revealBtn = document.getElementById('revealVotesBtn');
  if (revealBtn) {
    revealBtn.addEventListener('click', () => revealVotes());
  }

  const requestBtn = document.getElementById('requestVotesBtn');
  if (requestBtn) {
    requestBtn.addEventListener('click', () => requestStoryVotes());
  }
}

function handleSocketMessage(message) {
  switch (message.type) {
    case 'storySelected':
      currentStoryId = getStoryIdByIndex(message.storyIndex);
      break;
    case 'voteUpdate':
      storeVote(message.storyId, message.userId, message.vote);
      break;
    case 'storyVotes':
      applyVotesToUI(message.storyId, message.votes);
      break;
    case 'votesRevealed':
      displayStatistics(message.storyId);
      break;
    case 'ticketRemoved':
      clearVoteUI();
      break;
  }
}

function storeVote(storyId, userId, vote) {
  if (!votesPerStory[storyId]) votesPerStory[storyId] = {};
  votesPerStory[storyId][userId] = vote;
}

function applyVotesToUI(storyId, votes) {
  if (storyId !== getCurrentStoryId()) return;
  const userVote = votes[userName];
  if (userVote) {
    document.querySelectorAll('.vote-card-space').forEach(space => {
      space.classList.add('has-vote');
      space.innerHTML = `<span class="vote-badge">${userVote}</span>`;
    });
  }
}

function displayStatistics(storyId) {
  if (!votesPerStory[storyId]) return;

  const votes = votesPerStory[storyId];
  const statsContainer = document.querySelector('.vote-statistics-container');
  if (statsContainer) {
    statsContainer.style.display = 'block';
    statsContainer.innerHTML = `
      <div class="fixed-vote-card">${mostCommonVote(votes)}</div>
      <div class="fixed-stat-value">Average: ${averageVote(votes)}</div>
    `;
  }
}

function mostCommonVote(votes) {
  const count = {};
  for (const vote of Object.values(votes)) {
    count[vote] = (count[vote] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}

function averageVote(votes) {
  const nums = Object.values(votes).map(Number).filter(v => !isNaN(v));
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length || 0;
  return Math.round(avg * 10) / 10;
}

function clearVoteUI() {
  document.querySelectorAll('.vote-badge').forEach(el => el.remove());
  document.querySelectorAll('.vote-card-space').forEach(el => el.classList.remove('has-vote'));
  const statsContainer = document.querySelector('.vote-statistics-container');
  if (statsContainer) statsContainer.style.display = 'none';
}

function getStoryIdByIndex(index) {
  const story = document.querySelector(`.story-card[data-index="${index}"]`);
  return story?.id || null;
}

document.addEventListener('DOMContentLoaded', setup);
