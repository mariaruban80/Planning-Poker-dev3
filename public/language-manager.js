// Language Manager - Dynamic Translation System
const translationCache = {};

class LanguageManager {
  constructor() {
    if (!sessionStorage.getItem('languageForced')) {
      localStorage.setItem('selectedLanguage', 'en');
      sessionStorage.setItem('languageForced', 'true');
    }

    this.currentLanguage = localStorage.getItem('selectedLanguage') || 'en';
    this.selectedLanguage = this.currentLanguage;
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
      { code: 'th', name: 'ไทย', flagCode: 'th' }
    ];

    this.cache = new Map();
    this.translating = false;

    // 🔗 Attach the helper method
    this.translateText = translateText;
  }

  showLanguageModal() {
    const modal = document.getElementById('languageModalCustom');
    const grid = document.getElementById('languageGrid');
    if (!modal || !grid) return;

    grid.innerHTML = '';

    this.supportedLanguages.forEach(lang => {
      const option = document.createElement('div');
      option.className = 'language-option';
      if (lang.code === this.currentLanguage) option.classList.add('selected');

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
    if (modal) modal.style.display = 'none';
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
      'textarea[placeholder]'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (this.shouldTranslateElement(el)) {
          elements.push({ element: el, type: 'text', original: el.textContent.trim() });
        }
      });
    });

    document.querySelectorAll('.story-title').forEach(el => {
      if (el.textContent.trim()) {
        elements.push({ element: el, type: 'story', original: el.textContent.trim() });
      }
    });

    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      if (el.placeholder.trim()) {
        elements.push({ element: el, type: 'placeholder', original: el.placeholder.trim() });
      }
    });

    const ticketId = document.getElementById('ticketNameInput');
    const ticketDesc = document.getElementById('ticketDescriptionEditor');

    if (ticketId && ticketId.placeholder.trim()) {
      elements.push({ element: ticketId, type: 'placeholder', original: ticketId.placeholder.trim() });
    }

    if (ticketDesc && ticketDesc.placeholder?.trim()) {
      elements.push({ element: ticketDesc, type: 'placeholder', original: ticketDesc.placeholder.trim() });
    }

    return elements;
  }

  shouldTranslateElement(el) {
    const text = el.textContent.trim();
    if (!text || text.length < 2) return false;
    if (/^[\d\s\-\+\*\/\=\(\)\[\]\{\}]+$/.test(text)) return false;
    if (el.classList.contains('no-translate') || el.closest('.no-translate')) return false;
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
    } catch (err) {
      console.error('Batch translation failed:', err);
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

  updateStoryData(el, translation) {
    const storyCard = el.closest('.story-card');
    if (storyCard) {
      if (!storyCard.dataset.originalText) {
        storyCard.dataset.originalText = el.textContent;
      }
      storyCard.dataset.translatedText = translation;
    }
  }

  async translateTexts(texts) {
    const results = [];
    for (const text of texts) {
      const cacheKey = `${text}_${this.currentLanguage}`;
      if (this.cache.has(cacheKey)) {
        results.push(this.cache.get(cacheKey));
        continue;
      }

      const translated = await this.translateText(text, this.currentLanguage);
      this.cache.set(cacheKey, translated);
      results.push(translated);
    }
    return results;
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

    const langName = this.supportedLanguages.find(lang => lang.code === this.currentLanguage)?.name || 'Language';
    message.textContent = `✓ Interface translated to ${langName}`;

    document.body.appendChild(message);
    setTimeout(() => message.remove(), 3000);
  }

  initialize() {
    if (this.currentLanguage !== 'en') {
      setTimeout(() => this.translateInterface(), 1000);
    }
  }
}

// 🔗 Async translation helper (OUTSIDE the class)
const translateText = async (text, targetLang) => {
  const cacheKey = `${text}::${targetLang}`;
  if (translationCache[cacheKey]) return translationCache[cacheKey];

  try {
    const response = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: 'en',
        target: targetLang,
        format: 'text'
      })
    });
    const data = await response.json();
    if (data?.translatedText) {
      translationCache[cacheKey] = data.translatedText;
      return data.translatedText;
    }
  } catch (libreError) {
    console.warn('[TRANSLATION] LibreTranslate failed:', libreError);
  }

  try {
    const fallbackURL = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
    const fallbackResponse = await fetch(fallbackURL);
    const fallbackData = await fallbackResponse.json();

    if (fallbackData?.responseData?.translatedText) {
      translationCache[cacheKey] = fallbackData.responseData.translatedText;
      return fallbackData.responseData.translatedText;
    }
  } catch (fallbackError) {
    console.error('[TRANSLATION] MyMemory fallback also failed:', fallbackError);
  }

  return text; // Fallback to original
};

// 🔗 Init global hooks
window.languageManager = new LanguageManager();
window.showLanguageModal = () => window.languageManager.showLanguageModal();
window.hideLanguageModal = () => window.languageManager.hideLanguageModal();

document.addEventListener('DOMContentLoaded', () => {
  window.languageManager.initialize();
  document.getElementById('applyLanguageBtn')?.addEventListener('click', () => {
    window.languageManager.applyLanguageChanges();
  });
});
