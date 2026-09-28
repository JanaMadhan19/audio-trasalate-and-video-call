import { COMMON_PHRASE_DICTIONARY, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages';

export interface TranslationResult {
  originalText: string;
  sourceLang: string;
  targetLang: string;
  translatedText: string;
  confidence: number;
  engine: 'instant-dict' | 'gemini-cloud' | 'phonetic-echo';
}

/**
 * Normalizes speech text for dictionary matching and clean subtitle display
 */
export function normalizeSpeechText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Fast client-side translation lookup with Telugu priority
 */
export function lookupFastTranslation(text: string, targetLang: string = DEFAULT_LANGUAGE): string | null {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return null;

  // Direct match
  if (COMMON_PHRASE_DICTIONARY[normalized] && COMMON_PHRASE_DICTIONARY[normalized][targetLang]) {
    return COMMON_PHRASE_DICTIONARY[normalized][targetLang];
  }

  // Partial phrase search
  for (const [key, translations] of Object.entries(COMMON_PHRASE_DICTIONARY)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      if (translations[targetLang]) {
        return translations[targetLang];
      }
    }
  }

  return null;
}

/**
 * Full translation pipeline with low latency:
 * 1. Checks fast dictionary (<10ms)
 * 2. If not found, calls backend /api/translate with Gemini model
 * 3. Falls back gracefully
 */
export async function translateSpeechText(
  text: string,
  sourceLang: string,
  targetLang: string = DEFAULT_LANGUAGE
): Promise<TranslationResult> {
  const clean = text.trim();
  if (!clean) {
    return {
      originalText: '',
      sourceLang,
      targetLang,
      translatedText: '',
      confidence: 1,
      engine: 'instant-dict',
    };
  }

  // If source and target are the same, return as is
  if (sourceLang === targetLang) {
    return {
      originalText: clean,
      sourceLang,
      targetLang,
      translatedText: clean,
      confidence: 1,
      engine: 'instant-dict',
    };
  }

  // 1. Try fast local dictionary
  const dictMatch = lookupFastTranslation(clean, targetLang);
  if (dictMatch) {
    return {
      originalText: clean,
      sourceLang,
      targetLang,
      translatedText: dictMatch,
      confidence: 0.98,
      engine: 'instant-dict',
    };
  }

  // 2. Fetch from backend /api/translate
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean,
        sourceLang,
        targetLang,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.translatedText) {
        return {
          originalText: clean,
          sourceLang,
          targetLang,
          translatedText: data.translatedText,
          confidence: data.confidence || 0.95,
          engine: data.engine || 'gemini-cloud',
        };
      }
    }
  } catch (err) {
    console.warn('Backend translation failed, falling back:', err);
  }

  // Fallback for Telugu or selected language
  const targetObj = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang);
  const langName = targetObj ? targetObj.nativeName : targetLang;

  return {
    originalText: clean,
    sourceLang,
    targetLang,
    translatedText: `[${langName}]: ${clean}`,
    confidence: 0.8,
    engine: 'phonetic-echo',
  };
}

/**
 * Text-to-Speech synthesizer in the recipient's preferred language
 */
export function speakTranslatedText(text: string, langCode: string = DEFAULT_LANGUAGE, volume: number = 0.8) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  try {
    window.speechSynthesis.cancel(); // Cancel any ongoing speech to maintain low latency

    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langObj?.ttsCode || (langCode === 'te' ? 'te-IN' : 'en-US');
    utterance.volume = volume;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try finding a matching native voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(
      (v) => v.lang.startsWith(langCode) || (langCode === 'te' && v.lang.includes('te'))
    );
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('TTS playback error:', err);
  }
}

/**
 * Speech Recognition Wrapper with Auto-Restart and Fallbacks
 */
export class SpeechRecognitionService {
  private recognition: any = null;
  private isListening: boolean = false;
  private currentLanguage: string = 'en';
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((err: string) => void) | null = null;

  constructor(languageCode: string = 'en') {
    this.currentLanguage = languageCode;
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('SpeechRecognition API not available in this browser');
      return;
    }

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.setLanguage(this.currentLanguage);

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript.trim() && this.onTranscriptCallback) {
          this.onTranscriptCallback(finalTranscript.trim(), true);
        } else if (interimTranscript.trim() && this.onTranscriptCallback) {
          this.onTranscriptCallback(interimTranscript.trim(), false);
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn('Speech recognition error event:', event.error);
        if (this.onErrorCallback) {
          this.onErrorCallback(event.error);
        }
      };

      this.recognition.onend = () => {
        // Auto-restart if still marked as listening
        if (this.isListening && this.recognition) {
          try {
            this.recognition.start();
          } catch (e) {
            // Already active or denied
          }
        }
      };
    } catch (e) {
      console.error('Failed to initialize SpeechRec:', e);
    }
  }

  public setLanguage(langCode: string) {
    this.currentLanguage = langCode;
    if (this.recognition) {
      const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
      this.recognition.lang = langConfig ? langConfig.speechCode : 'en-US';
    }
  }

  public start(
    onTranscript: (text: string, isFinal: boolean) => void,
    onError?: (err: string) => void
  ) {
    this.onTranscriptCallback = onTranscript;
    if (onError) this.onErrorCallback = onError;
    this.isListening = true;

    if (!this.recognition) {
      this.initRecognition();
    }

    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (err) {
        // Can be already started
      }
    }
  }

  public stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {
        // ignore
      }
    }
  }

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }
}

/**
 * AUTOMATED UNIT TESTS FOR SPEECH PROCESSING COMPONENTS
 * As requested by user: "implement automated unit tests for speech processing components"
 */
export interface UnitTestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export async function runAutomatedSpeechUnitTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: UnitTestResult[];
}> {
  const results: UnitTestResult[] = [];

  // Test 1: Speech Normalizer
  const t1Start = performance.now();
  const rawText = "  Hello! How are you doing???  ";
  const normalized = normalizeSpeechText(rawText);
  const t1Pass = normalized === "hello how are you doing";
  results.push({
    name: 'Speech Text Normalization',
    passed: t1Pass,
    message: t1Pass ? `Normalized "${rawText}" -> "${normalized}"` : `Mismatch: expected "hello how are you doing", got "${normalized}"`,
    durationMs: Math.round(performance.now() - t1Start),
  });

  // Test 2: Instant Telugu Dictionary Lookup
  const t2Start = performance.now();
  const teluguHello = lookupFastTranslation('hello', 'te');
  const t2Pass = Boolean(teluguHello && teluguHello.includes('నమస్కారం'));
  results.push({
    name: 'Default Telugu Translation ("hello" -> "నమస్కారం")',
    passed: t2Pass,
    message: t2Pass ? `Telugu match: "${teluguHello}"` : `Failed to resolve Telugu mapping for "hello"`,
    durationMs: Math.round(performance.now() - t2Start),
  });

  // Test 3: Language Switching & Multi-Target Resolution
  const t3Start = performance.now();
  const hindiHello = lookupFastTranslation('thank you', 'hi');
  const tamilHello = lookupFastTranslation('thank you', 'ta');
  const t3Pass = Boolean(hindiHello && hindiHello.includes('धन्यवाद') && tamilHello && tamilHello.includes('நன்றி'));
  results.push({
    name: 'Multi-Language Dictionary Switching (Hindi & Tamil)',
    passed: t3Pass,
    message: t3Pass ? `HI: "${hindiHello}", TA: "${tamilHello}"` : `Failed multi-language resolution`,
    durationMs: Math.round(performance.now() - t3Start),
  });

  // Test 4: Identity Translation (Same Source and Target Language)
  const t4Start = performance.now();
  const identityRes = await translateSpeechText('Testing audio channel', 'en', 'en');
  const t4Pass = identityRes.translatedText === 'Testing audio channel';
  results.push({
    name: 'Identity Language Preservation (No-Op Fast Path)',
    passed: t4Pass,
    message: t4Pass ? 'Identity check verified' : 'Identity check failed',
    durationMs: Math.round(performance.now() - t4Start),
  });

  // Test 5: Default Language Fallback Check
  const t5Start = performance.now();
  const defaultLangCheck = DEFAULT_LANGUAGE === 'te';
  results.push({
    name: 'System Default Language Verification (Telugu)',
    passed: defaultLangCheck,
    message: defaultLangCheck ? `Default language verified as "${DEFAULT_LANGUAGE}"` : `Default is not Telugu: ${DEFAULT_LANGUAGE}`,
    durationMs: Math.round(performance.now() - t5Start),
  });

  const passedCount = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results,
  };
}
