// Language Manager - Dynamic Translation System
const translationCache = {};

class LanguageManager {
  constructor() {
    this.translationCache = {};
    this.cache = new Map();
    this.translating = false;
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
  }

  showLanguageModal() {
    const modal = document.getElementById('languageModalCustom');
    const grid = document.getElementById('languageGrid');
    if (!modal || !grid) return;
    grid.innerHTML = '';

    this.supportedLanguages.forEach(lang => {
      const option = document.createElement('div');
      option.className = 'language-option' + (lang.code === this.currentLanguage ? ' selected' : '');
      option.innerHTML = `
        <span class="language-flag">
          <img src="https://flagcdn.com/24x18/${lang.flagCode}.png" alt="${lang.code}">
        </span>
        <div class="language-info">
          <div class="language-name">${lang.name}</div>
          <div class="language-code">${lang.code}</div>
        </div>
        <input type="radio" name="language" value="${lang.code}" class="language-radio" ${lang.code === this.currentLanguage ? 'checked' : ''}>
      `;
      option.addEventListener('click', () => this.selectLanguage(lang.code, option));
      grid.appendChild(option);
    });

    modal.style.display = 'flex';
  }

  hideLanguageModal() {
    const modal = document.getElementById('languageModalCustom');
    if (modal) modal.style.display = 'none';
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

  async applyLanguageChanges() {
    if (this.selectedLanguage === this.currentLanguage) {
      this.hideLanguageModal();
      return;
    }

    this.translating = true;
    const applyBtn = document.getElementById('applyLanguageBtn');
    const originalText = applyBtn.textContent;

    applyBtn.innerHTML = '<span class="loading-spinner"></span>Translating...';
    applyBtn.disabled = true;

    try {
      this.currentLanguage = this.selectedLanguage;
      localStorage.setItem('selectedLanguage', this.currentLanguage);

      await this.translateInterface();
      this.hideLanguageModal();
      this.showTranslationSuccess();
    } catch (e) {
      console.error('[TRANSLATION] Failed:', e);
      alert('Translation failed. Try again.');
    } finally {
      this.translating = false;
      applyBtn.textContent = originalText;
      applyBtn.disabled = false;
    }
  }

  async translateInterface() {
    if (this.currentLanguage === 'en') {
      location.reload();
      return;
    }

    const elements = this.getTranslatableElements();
    const batches = this.createBatches(elements, 10);

    for (const batch of batches) {
      await this.translateBatch(batch);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  getTranslatableElements() {
    const targets = [];

    const selectors = [
      'h1,h2,h3,h4,h5,h6', 'label', 'button', '.button', '.story-title',
      '.nav-links a', '.section-heading', '.user-name',
      'input[placeholder]', 'textarea[placeholder]'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.closest('.no-translate')) {
          if (el.placeholder) {
            targets.push({ element: el, type: 'placeholder', original: el.placeholder });
          } else if (el.textContent.trim()) {
            targets.push({ element: el, type: 'text', original: el.textContent.trim() });
          }
        }
      });
    });

    return targets;
  }

  createBatches(elements, size) {
    const result = [];
    for (let i = 0; i < elements.length; i += size) {
      result.push(elements.slice(i, i + size));
    }
    return result;
  }

  async translateBatch(batch) {
    const texts = batch.map(item => item.original);
    const translations = await this.translateTexts(texts);

    batch.forEach((item, idx) => {
      const translated = translations[idx];
      if (translated && translated !== item.original) {
        if (item.type === 'placeholder') {
          item.element.placeholder = translated;
        } else {
          item.element.textContent = translated;
        }
      }
    });
  }

  async translateTexts(texts) {
    const translatedTexts = [];
    for (let text of texts) {
      const cacheKey = `${text}::${this.currentLanguage}`;
      if (this.cache.has(cacheKey)) {
        translatedTexts.push(this.cache.get(cacheKey));
        continue;
      }

      try {
        const translation = await this.translateText(text, this.currentLanguage);
        this.cache.set(cacheKey, translation);
        translatedTexts.push(translation);
      } catch {
        translatedTexts.push(text); // fallback to original
      }
    }
    return translatedTexts;
  }

  async translateText(text, targetLang) {
    const maxLen = 450;
    if (text.length > maxLen) {
      const chunks = text.match(new RegExp(`.{1,${maxLen}}`, 'g')) || [];
      const translatedChunks = [];

      for (const chunk of chunks) {
        const partial = await this.fetchTranslation(chunk, targetLang);
        translatedChunks.push(partial);
      }

      return translatedChunks.join('');
    } else {
      return await this.fetchTranslation(text, targetLang);
    }
  }

  async fetchTranslation(text, lang) {
    // Try LibreTranslate
    try {
      const res = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'en', target: lang, format: 'text' })
      });
      const data = await res.json();
      if (data.translatedText) return data.translatedText;
    } catch {}

    // Fallback to MyMemory
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`);
      const data = await res.json();
      return data?.responseData?.translatedText || text;
    } catch {
      return text;
    }
  }

  showTranslationSuccess() {
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: green; color: white;
      padding: 12px 20px; border-radius: 5px;
      font-weight: bold; z-index: 10000;
    `;
    const langName = this.supportedLanguages.find(l => l.code === this.currentLanguage)?.name || this.currentLanguage;
    msg.textContent = `✓ Translated to ${langName}`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }

  initialize() {
    if (this.currentLanguage !== 'en') {
      setTimeout(() => this.translateInterface(), 500);
    }
  }
}

// Bind to window
window.languageManager = new LanguageManager();
window.showLanguageModal = () => window.languageManager.showLanguageModal();
window.hideLanguageModal = () => window.languageManager.hideLanguageModal();

document.addEventListener('DOMContentLoaded', () => {
  window.languageManager.initialize();
  document.getElementById('applyLanguageBtn')?.addEventListener('click', () => {
    window.languageManager.applyLanguageChanges();
  });
});


