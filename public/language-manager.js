// Language Manager - Dynamic Translation System
class LanguageManager {
  constructor() {
    this.currentLanguage = localStorage.getItem('selectedLanguage') || 'en';
    this.supportedLanguages = [
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'it', name: 'Italiano', flag: '🇮🇹' },
      { code: 'pt', name: 'Português', flag: '🇵🇹' },
      { code: 'ru', name: 'Русский', flag: '🇷🇺' },
      { code: 'ja', name: '日本語', flag: '🇯🇵' },
      { code: 'ko', name: '한국어', flag: '🇰🇷' },
      { code: 'zh', name: '中文', flag: '🇨🇳' },
      { code: 'ar', name: 'العربية', flag: '🇸🇦' },
      { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
      { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
      { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
      { code: 'da', name: 'Dansk', flag: '🇩🇰' },
      { code: 'no', name: 'Norsk', flag: '🇳🇴' },
      { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
      { code: 'pl', name: 'Polski', flag: '🇵🇱' },
      { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
      { code: 'th', name: 'ไทย', flag: '🇹🇭' },
    ];
    this.cache = new Map();
    this.translating = false;
  }
 showLanguageModal() {
    const modal = document.getElementById('languageModalCustom');
    const grid = document.getElementById('languageGrid');
    
    if (!modal || !grid) return;
    
    // Clear previous content
    grid.innerHTML = '';
    
    // Populate language options
    this.supportedLanguages.forEach(lang => {
      const option = document.createElement('div');
      option.className = 'language-option';
      if (lang.code === this.currentLanguage) {
        option.classList.add('selected');
      }
      
      option.innerHTML = `
        <span class="language-flag">${lang.flag}</span>	
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


  // Select a language
  selectLanguage(langCode, element) {
    // Remove previous selections
    document.querySelectorAll('.language-option').forEach(opt => {
      opt.classList.remove('selected');
      const radio = opt.querySelector('.language-radio');
      if (radio) radio.checked = false;
    });
    
    // Select current option
    element.classList.add('selected');
    const radio = element.querySelector('.language-radio');
    if (radio) radio.checked = true;
    
    this.selectedLanguage = langCode;
  }

  // Hide language modal
  hideLanguageModal() {
    const modal = document.getElementById('languageModalCustom');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // Apply language changes
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
      // Show loading state
      applyBtn.innerHTML = '<span class="loading-spinner"></span>Translating...';
      applyBtn.disabled = true;
      
      // Update current language
      this.currentLanguage = this.selectedLanguage;
      localStorage.setItem('selectedLanguage', this.currentLanguage);
      
      // Translate the entire interface
      await this.translateInterface();
      
      // Hide modal
      this.hideLanguageModal();
      
      // Show success message
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

  // Translate the entire interface
  async translateInterface() {
    if (this.currentLanguage === 'en') {
      // If switching back to English, reload the page
      window.location.reload();
      return;
    }

    // Get all translatable elements
    const elements = this.getTranslatableElements();
    
    // Batch translate for efficiency
    const batches = this.createBatches(elements, 20);
    
    for (const batch of batches) {
      await this.translateBatch(batch);
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Get all elements that need translation
  getTranslatableElements() {
    const elements = [];
    
    // Static UI elements
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
      'input[placeholder]'
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
    
    // Story titles
    document.querySelectorAll('.story-title').forEach(el => {
      if (el.textContent.trim()) {
        elements.push({
            element: el,
            type: 'story',
            original: el.textContent.trim()
        });
      }
    });
    
    // Placeholder texts
    document.querySelectorAll('input[placeholder]').forEach(el => {
      if (el.placeholder.trim()) {
        elements.push({
          element: el,
          type: 'placeholder',
          original: el.placeholder.trim()
        });
      }
    });
    
    return elements;
  }

  // Check if element should be translated
  shouldTranslateElement(element) {
    const text = element.textContent.trim();
    if (!text || text.length < 2) return false;
    
    // Skip if contains only numbers or symbols
    if (/^[\d\s\-\+\*\/\=\(\)\[\]\{\}]+$/.test(text)) return false;
    
    // Skip if element has class that indicates it shouldn't be translated
    if (element.classList.contains('no-translate')) return false;
    
    // Skip if parent has no-translate class
    if (element.closest('.no-translate')) return false;
    
    return true;
  }

  // Create batches for efficient translation
  createBatches(elements, batchSize) {
    const batches = [];
    for (let i = 0; i < elements.length; i += batchSize) {
      batches.push(elements.slice(i, i + batchSize));
    }
    return batches;
  }

  // Translate a batch of elements
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

  // Apply translation to element
  applyTranslation(item, translation) {
    switch (item.type) {
      case 'text':
        item.element.textContent = translation;
        break;
      case 'story':
        item.element.textContent = translation;
        // Also update the story data if needed
        this.updateStoryData(item.element, translation);
        break;
      case 'placeholder':
        item.element.placeholder = translation;
        break;
    }
  }

  // Update story data when translated
  updateStoryData(element, translation) {
    const storyCard = element.closest('.story-card');
    if (storyCard) {
      // Store original text if not already stored
      if (!storyCard.dataset.originalText) {
        storyCard.dataset.originalText = element.textContent;
      }
      storyCard.dataset.translatedText = translation;
    }
  }

  // Translate texts using Google Translate API (free service)
  async translateTexts(texts) {
    const translations = [];
    
    for (const text of texts) {
      try {
        // Check cache first
        const cacheKey = `${text}_${this.currentLanguage}`;
        if (this.cache.has(cacheKey)) {
          translations.push(this.cache.get(cacheKey));
          continue;
        }
        
        // Use Google Translate (you can also use other services)
        const translation = await this.translateText(text, this.currentLanguage);
        
        // Cache the translation
        this.cache.set(cacheKey, translation);
        translations.push(translation);
        
      } catch (error) {
        console.error('Translation error for text:', text, error);
        translations.push(text); // Fallback to original
      }
    }
    
    return translations;
  }

  // Translate single text using Google Translate API
  async translateText(text, targetLang) {
    // For demo purposes, using a free translation service
    // In production, you'd use Google Translate API with your API key
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`);
      const data = await response.json();
      
      if (data.responseStatus === 200) {
        return data.responseData.translatedText;
      }
    } catch (error) {
      console.error('Translation API error:', error);
    }
    
    // Fallback: Return original text if translation fails
    return text;
  }

  // Show success message
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
    
    setTimeout(() => {
      message.remove();
    }, 3000);
  }

  // Initialize language manager
  initialize() {
    // Apply stored language on page load
    if (this.currentLanguage !== 'en') {
      setTimeout(() => {
        this.translateInterface();
      }, 1000);
    }
  }
}

// Initialize global language manager
window.languageManager = new LanguageManager();

// Global functions for modal controls
window.showLanguageModal = () => window.languageManager.showLanguageModal();
window.hideLanguageModal = () => window.languageManager.hideLanguageModal();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  window.languageManager.initialize();
  
  // Connect the apply button
  document.getElementById('applyLanguageBtn')?.addEventListener('click', () => {
    window.languageManager.applyLanguageChanges();
  });
});
