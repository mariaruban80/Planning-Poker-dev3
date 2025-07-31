// Language Manager - Dynamic Translation System
class LanguageManager {
  constructor() {
    this.currentLanguage = localStorage.getItem('selectedLanguage') || 'en';
    this.supportedLanguages = [
      { code: 'en', name: 'English', flagCode: 'us' },
      { code: 'es', name: 'Español', flagCode: 'es' },
      { code: 'fr', name: 'Français', flagCode: 'fr' },
      { code: 'de', name: 'Deutsch', flagCode: 'de' },
      { code: 'it', name: 'Italiano', flagCode: 'it' },
      { code: 'pt', name: 'Português', flagCode: 'pt' },
      { code: 'ru', name: 'Русский', flagCode: 'ru' },
      { code: 'ja', name: '日本語', flagCode: 'jp' },
      { code: 'ko', name: '한국어', flagCode: 'kr' },
      { code: 'zh', name: '中文', flagCode: 'cn' },
      { code: 'ar', name: 'العربية', flagCode: 'sa' },
      { code: 'hi', name: 'हिन्दी', flagCode: 'in' },
      { code: 'nl', name: 'Nederlands', flagCode: 'nl' },
      { code: 'sv', name: 'Svenska', flagCode: 'se' },
      { code: 'da', name: 'Dansk', flagCode: 'dk' },
      { code: 'no', name: 'Norsk', flagCode: 'no' },
      { code: 'fi', name: 'Suomi', flagCode: 'fi' },
      { code: 'pl', name: 'Polski', flagCode: 'pl' },
      { code: 'tr', name: 'Türkçe', flagCode: 'tr' },
      { code: 'th', name: 'ไทย', flagCode: 'th' },
    ];
    this.cache = new Map();
    this.translating = false;
  }

  showLanguageModal() {
    const modal = document.getElementById('languageModalCustom');
    const grid = document.getElementById('languageGrid');
    if (!modal || !grid) return;
    grid.innerHTML = '';

    this.supportedLanguages.forEach(lang => {
      const option = document.createElement('div');
      option.className = 'language-option';
      if (lang.code === this.currentLanguage) {
        option.classList.add('selected');
      }

      option.innerHTML = `
        <span class="language-flag">
          <img src="https://flagcdn.com/24x18/${lang.flagCode}.png" alt="${lang.code}" style="width:24px;height:18px;">
        </span>
        <div class="language-info">
          <div class="language-name">${lang.name}</div>
          <div class="language-code">${lang.code}</div>
        </div>
        <input type="radio" name="language" value="${lang.code}" 
               class="language-radio" ${lang.code === this.currentLanguage ? 'checked' : ''}>
      `;

      option.addEventListener('click', () => this.selectLanguage(lang.code, option));
      grid.appendChild(option);
    });

    modal.style.display = 'flex';
  }

  selectLanguage(langCode, element) {
    document.querySelectorAll('.language-option').forEach(opt => {
      opt.classList.remove('selected');
      const radio = opt.querySelector('.language-radio');
      if (radio) radio.checked = false;
    });

    element.classList.add('selected');
    const radio = element.querySelector('.language-radio');
    if (radio) radio.checked = true;

    this.selectedLanguage = langCode;
  }

  hideLanguageModal() {
    const modal = document.getElementById('languageModalCustom');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  async applyLanguageChanges() {
    if (!this.selectedLanguage || this.selectedLanguage === this.currentLanguage) {
      this.hideLanguageModal();
      return;
    }

    if (this.translating) return;
    this.translating = true;
    const applyBtn = document.getElementById('applyLanguageBtn');
    const originalText = applyBtn.textContent;

    try {
      applyBtn.innerHTML = '<span class="loading-spinner"></span>Translating...';
      applyBtn.disabled = true;

      this.currentLanguage = this.selectedLanguage;
      localStorage.setItem('selectedLanguage', this.currentLanguage);

      await this.translateInterface();
      this.hideLanguageModal();
      this.showTranslationSuccess();
    } catch (error) {
      console.error('Translation failed:', error);
      alert('Translation failed. Please try again.');
    } finally {
      this.translating = false;
      applyBtn.textContent = originalText;
      applyBtn.disabled = false;
    }
  }

  async translateInterface() {
    if (this.currentLanguage === 'en') {
      window.location.reload();
      return;
    }

    const elements = this.getTranslatableElements();
    const batches = this.createBatches(elements, 20);
    for (const batch of batches) {
      await this.translateBatch(batch);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
getTranslatableElements() {
  const elements = [];
  const selectors = [
    'h1, h2, h3, h4, h5, h6',
    'button:not(.close-button):not(.language-apply-btn):not(.language-cancel-btn)',
    'label',
    '.button',
    '.nav-links a',
    '.sidebar h3',
    '.rightbar h3',
    '.planning-cards-section h3',
    '.section-heading',
    '.user-name',
    '.no-stories-message',
    'input[placeholder]',
    'textarea[placeholder]' // <-- added for future-proofing
  ];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      if (this.shouldTranslateElement(el)) {
        elements.push({
          element: el,
          type: 'text',
          original: el.textContent.trim()
        });
      }
    });
  });

  // Translate story titles
  document.querySelectorAll('.story-title').forEach(el => {
    if (el.textContent.trim()) {
      elements.push({
        element: el,
        type: 'story',
        original: el.textContent.trim()
      });
    }
  });

  // Translate placeholders from inputs
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    if (el.placeholder.trim()) {
      elements.push({
        element: el,
        type: 'placeholder',
        original: el.placeholder.trim()
      });
    }
  });

  // ✅ NEW: Handle ticket modal fields by ID (exact target)
  const ticketId = document.getElementById('ticketNameInput');
  const ticketDesc = document.getElementById('ticketDescriptionEditor');

  if (ticketId && ticketId.placeholder.trim()) {
    elements.push({
      element: ticketId,
      type: 'placeholder',
      original: ticketId.placeholder.trim()
    });
  }

  if (ticketDesc && ticketDesc.placeholder && ticketDesc.placeholder.trim()) {
    elements.push({
      element: ticketDesc,
      type: 'placeholder',
      original: ticketDesc.placeholder.trim()
    });
  }

  return elements;
}



  shouldTranslateElement(element) {
    const text = element.textContent.trim();
    if (!text || text.length < 2) return false;
    if (/^[\d\s\-\+\*\/\=\(\)\[\]\{\}]+$/.test(text)) return false;
    if (element.classList.contains('no-translate')) return false;
    if (element.closest('.no-translate')) return false;
    return true;
  }

  createBatches(elements, batchSize) {
    const batches = [];
    for (let i = 0; i < elements.length; i += batchSize) {
      batches.push(elements.slice(i, i + batchSize));
    }
    return batches;
  }

  async translateBatch(batch) {
    const textsToTranslate = batch.map(item => item.original);
    try {
      const translations = await this.translateTexts(textsToTranslate);
      batch.forEach((item, index) => {
        const translation = translations[index];
        if (translation && translation !== item.original) {
          this.applyTranslation(item, translation);
        }
      });
    } catch (error) {
      console.error('Batch translation failed:', error);
    }
  }

  applyTranslation(item, translation) {
    switch (item.type) {
      case 'text':
        item.element.textContent = translation;
        break;
      case 'story':
        item.element.textContent = translation;
        this.updateStoryData(item.element, translation);
        break;
      case 'placeholder':
        item.element.placeholder = translation;
        break;
    }
  }

  updateStoryData(element, translation) {
    const storyCard = element.closest('.story-card');
    if (storyCard) {
      if (!storyCard.dataset.originalText) {
        storyCard.dataset.originalText = element.textContent;
      }
      storyCard.dataset.translatedText = translation;
    }
  }

  async translateTexts(texts) {
    const translations = [];
    for (const text of texts) {
      try {
        const cacheKey = `${text}_${this.currentLanguage}`;
        if (this.cache.has(cacheKey)) {
          translations.push(this.cache.get(cacheKey));
          continue;
        }

        const translation = await this.translateText(text, this.currentLanguage);
        this.cache.set(cacheKey, translation);
        translations.push(translation);
      } catch (error) {
        console.error('Translation error for text:', text, error);
        translations.push(text);
      }
    }
    return translations;
  }

  async translateText(text, targetLang) {
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`);
      const data = await response.json();
      if (data.responseStatus === 200) {
        return data.responseData.translatedText;
      }
    } catch (error) {
      console.error('Translation API error:', error);
    }
    return text;
  }

  showTranslationSuccess() {
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 10001;
      font-weight: 600;
    `;

    const langName = this.supportedLanguages.find(lang => lang.code === this.currentLanguage)?.name || 'Selected Language';
    message.textContent = `✓ Interface translated to ${langName}`;

    document.body.appendChild(message);
    setTimeout(() => message.remove(), 3000);
  }

  initialize() {
    if (this.currentLanguage !== 'en') {
      setTimeout(() => {
        this.translateInterface();
      }, 1000);
    }
  }
}

// Initialize global language manager
window.languageManager = new LanguageManager();

window.showLanguageModal = () => window.languageManager.showLanguageModal();
window.hideLanguageModal = () => window.languageManager.hideLanguageModal();

document.addEventListener('DOMContentLoaded', function () {
  window.languageManager.initialize();
  document.getElementById('applyLanguageBtn')?.addEventListener('click', () => {
    window.languageManager.applyLanguageChanges();
  });
});
