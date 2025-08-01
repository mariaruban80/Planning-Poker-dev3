// Language Manager - Dynamic Translation System (Enhanced)

/** --- ENGLISH DEFAULT ON EACH LOAD (RECOMMENDATION #1) --- */
(function forceEnglishOnLoad(){
  // Always force english as the selected language by default on load
  localStorage.setItem('selectedLanguage', 'en');
})();

const translationCache = {};

class LanguageManager {
  constructor() {
    // Always start with ENGLISH on load
    this.currentLanguage = 'en';
    this.selectedLanguage = 'en';
    localStorage.setItem('selectedLanguage', 'en');
    this.translationCache = {};
    this.cache = new Map();
    this.translating = false;

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

  /** --- RECOMMENDATION #3: Overlay spinner for translation --- */
  showTranslationOverlay() {
    let overlay = document.getElementById('translationOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'translationOverlay';
      overlay.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10001;background:rgba(0,0,0,0.45);color:white;font-size:1.8em;align-items:center;justify-content:center;flex-direction:column;';
      overlay.innerHTML = `<div class="loading-spinner" style="margin-bottom:18px;border:5px solid #eee;border-top:5px solid #753acb;width:32px;height:32px;border-radius:50%;animation:spin 1s linear infinite;"></div>
      Translating, please wait...`;
      document.body.appendChild(overlay);

      // add keyframes if not present
      if (!document.getElementById('translationOverlaySpinnerKeyframes')) {
        const style = document.createElement('style');
        style.id = 'translationOverlaySpinnerKeyframes';
        style.textContent = `@keyframes spin { 0% { transform: rotate(0deg);} 100%{transform:rotate(360deg);} }`;
        document.head.appendChild(style);
      }
    }
    overlay.style.display = 'flex';
  }

  hideTranslationOverlay() {
    const overlay = document.getElementById('translationOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  async applyLanguageChanges() {
    if (this.selectedLanguage === this.currentLanguage) {
      this.hideLanguageModal();
      return;
    }

    this.translating = true;

    // Show overlay spinner (recommendation #3)
    this.showTranslationOverlay();

    const applyBtn = document.getElementById('applyLanguageBtn');
    const originalText = applyBtn ? applyBtn.textContent : '';

    if (applyBtn) {
      applyBtn.innerHTML = '<span class="loading-spinner"></span>Translating...';
      applyBtn.disabled = true;
    }

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
      if (applyBtn) {
        applyBtn.textContent = originalText;
        applyBtn.disabled = false;
      }
      this.hideTranslationOverlay();
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

    // --- #2: ALSO translate all currently visible story titles (cards) ---
    // (In case tickets were rendered after initial scan)
    this.translateAllStories();

    // --- #4: Sidebar labels ("Current Members") ---
    this.translateSidebarLabels();
  }

  /** --- #2: Translate all tickets/stories if not English --- */
  async translateAllStories() {
    if (this.currentLanguage === 'en') return;
    // storyTitle class is used for story cards
    document.querySelectorAll('.story-title').forEach(storyEl => {
      const text = storyEl.textContent.trim();
      this.translateText(text, this.currentLanguage).then(translated => {
        if (translated && translated !== text)
          storyEl.textContent = translated;
      });
    });
  }

  /** --- #4: Translate sidebar headings like "Current Members" ONLY (not names) --- */
  async translateSidebarLabels() {
    // Translate left-panel headings
    document.querySelectorAll('.sidebar h3, .section-heading').forEach(el => {
      const txt = el.textContent.trim();
      this.translateText(txt, this.currentLanguage).then(translated => {
        if (translated && translated !== txt)
          el.textContent = translated;
      });
    });
  }

  getTranslatableElements() {
    const targets = [];

    // Selectors for all standard UI elements—not usernames
    const selectors = [
      'h1,h2,h3,h4,h5,h6', 'label',
      'button', '.button',
      '.story-title',
      '.nav-links a', '.section-heading',
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

    // If you want to translate "Current Members" label in sidebar (not user names), it's picked up by '.sidebar h3'.
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

  /** --- Initialization: Always start in English, translate after user changes language --- */
  initialize() {
    // Patch #1: ALWAYS ENGLISH base state; if user has selected something else in this session, let them change.
    if (localStorage.getItem('selectedLanguage') !== 'en') {
      this.selectedLanguage = localStorage.getItem('selectedLanguage') || 'en';
      this.currentLanguage = 'en';
      localStorage.setItem('selectedLanguage', 'en');
    }
    // After user selects a new language, everything is managed via applyLanguageChanges()
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


/** --- #2: EXPORT an API for new stories to be translated as soon as they're added/edited --- */
/**
 * Call this function after adding or editing story cards,
 * so they are auto-translated for non-English users.
 */
window.languageManagerTranslateStoryElement = function(storyEl) {
  if (!storyEl || !window.languageManager) return;
  const curLang = window.languageManager.currentLanguage;
  if (curLang === 'en') return;
  const txt = storyEl.textContent.trim();
  window.languageManager.translateText(txt, curLang).then(translated => {
    if (translated !== txt) storyEl.textContent = translated;
  });
};
