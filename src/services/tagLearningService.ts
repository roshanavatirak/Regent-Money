import { mmkvStorage } from '../db/mmkv';
import {
  normalizeMerchantName,
  predictTagForTransaction,
  PAYTM_TRANSACTION_TAGS,
} from '../constants/transactionTags';
import { authService } from './authService';
import { getBackendUrl } from '../config/api';

const LEARNED_TAGS_STORAGE_KEY = 'user_merchant_tags_map';
const CUSTOM_TAGS_STORAGE_KEY = 'user_custom_transaction_tags';

class TagLearningService {
  private learnedMap: Record<string, string> | null = null;
  private customTags: string[] | null = null;

  /**
   * Initializes in-memory cache from MMKV
   */
  private ensureInitialized() {
    if (this.learnedMap === null) {
      try {
        const stored = mmkvStorage.getObject<Record<string, string>>(LEARNED_TAGS_STORAGE_KEY);
        this.learnedMap = stored || {};
      } catch {
        this.learnedMap = {};
      }
    }
    if (this.customTags === null) {
      try {
        const stored = mmkvStorage.getObject<string[]>(CUSTOM_TAGS_STORAGE_KEY);
        this.customTags = stored || [];
      } catch {
        this.customTags = [];
      }
    }
  }

  /**
   * Returns all learned merchant-tag mappings
   */
  getLearnedMap(): Record<string, string> {
    this.ensureInitialized();
    return { ...this.learnedMap! };
  }

  /**
   * Look up if the user has previously assigned a tag for this merchant.
   */
  getLearnedTag(merchant: string): string | null {
    if (!merchant) return null;
    this.ensureInitialized();
    const norm = normalizeMerchantName(merchant);
    if (!norm) return null;

    if (this.learnedMap![norm]) {
      return this.learnedMap![norm];
    }

    // Substring match
    for (const [key, tag] of Object.entries(this.learnedMap!)) {
      if (norm.includes(key) || key.includes(norm)) {
        return tag;
      }
    }

    // Token / word overlap match (e.g. "maharash sbin" inside "maharash sbin ticket")
    const words = norm.split(/\s+/).filter((w) => w.length > 2);
    for (const [key, tag] of Object.entries(this.learnedMap!)) {
      const keyWords = key.split(/\s+/).filter((w) => w.length > 2);
      if (keyWords.length > 0 && keyWords.every((w) => norm.includes(w))) {
        return tag;
      }
      if (words.length > 0 && words.every((w) => key.includes(w))) {
        return tag;
      }
    }

    return null;
  }

  /**
   * Retrieves the primary/default tag for a merchant/payee.
   * Checks learned user map first, then falls back to semantic prediction.
   */
  getPrimaryTag(merchant: string, type: 'debit' | 'credit' = 'debit'): string {
    if (!merchant) return type === 'credit' ? 'salary' : 'food';
    const learned = this.getLearnedTag(merchant);
    if (learned) return learned;
    return this.predict(merchant, undefined, type);
  }

  /**
   * Saves a user-chosen tag for a merchant.
   * Updates local MMKV immediately and syncs with backend database.
   */
  async saveLearnedTag(merchant: string, tag: string): Promise<void> {
    if (!merchant || !tag) return;
    this.ensureInitialized();
    const norm = normalizeMerchantName(merchant);
    if (!norm) return;

    // Update in-memory & MMKV
    this.learnedMap![norm] = tag;
    try {
      mmkvStorage.setObject(LEARNED_TAGS_STORAGE_KEY, this.learnedMap!);
    } catch (e) {
      console.warn('[TagLearningService] Failed to cache tag rule in MMKV:', e);
    }

    // If tag is not in standard Paytm tags, save as custom tag as well
    const isStandard = PAYTM_TRANSACTION_TAGS.some(
      t => t.id === tag || t.label.toLowerCase() === tag.toLowerCase()
    );
    if (!isStandard) {
      this.addCustomTag(tag);
    }

    // Sync to backend user rules table asynchronously
    try {
      const token = authService.getAccessToken();
      if (token) {
        const BACKEND_URL = getBackendUrl();
        await fetch(`${BACKEND_URL}/sync/merchant-tag-rule`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            merchant: norm,
            tag,
          }),
        });
      }
    } catch (err) {
      // Backend sync failure is non-blocking because local MMKV is already saved
      console.warn('[TagLearningService] Background sync to server failed:', err);
    }
  }

  /**
   * Removes a saved tag rule for a merchant.
   */
  async removeLearnedTag(merchant: string): Promise<void> {
    if (!merchant) return;
    this.ensureInitialized();
    const norm = normalizeMerchantName(merchant);
    if (!norm) return;

    if (this.learnedMap && this.learnedMap[norm]) {
      delete this.learnedMap[norm];
      try {
        mmkvStorage.setObject(LEARNED_TAGS_STORAGE_KEY, this.learnedMap);
      } catch (e) {
        console.warn('[TagLearningService] Failed to update MMKV on rule removal:', e);
      }
    }

    try {
      const token = authService.getAccessToken();
      if (token) {
        const BACKEND_URL = getBackendUrl();
        await fetch(`${BACKEND_URL}/sync/merchant-tag-rule?merchant=${encodeURIComponent(norm)}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (err) {
      console.warn('[TagLearningService] Server rule deletion failed:', err);
    }
  }

  /**
   * Fetches user merchant tag rules from backend database and caches in MMKV
   */
  async syncWithBackend(): Promise<void> {
    try {
      const token = authService.getAccessToken();
      if (!token) return;
      this.ensureInitialized();
      const BACKEND_URL = getBackendUrl();
      const res = await fetch(`${BACKEND_URL}/sync/merchant-tag-rules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const rules = await res.json();
      if (Array.isArray(rules)) {
        let updated = false;
        rules.forEach((r: any) => {
          if (r.merchantNormalized && r.tag) {
            this.learnedMap![r.merchantNormalized] = r.tag;
            updated = true;
          }
        });
        if (updated) {
          mmkvStorage.setObject(LEARNED_TAGS_STORAGE_KEY, this.learnedMap!);
        }
      }
    } catch (e) {
      console.warn('[TagLearningService] Failed to sync rules from backend:', e);
    }
  }

  /**
   * Returns user-created custom tags
   */
  getCustomTags(): string[] {
    this.ensureInitialized();
    return [...this.customTags!];
  }

  /**
   * Adds a new custom tag
   */
  addCustomTag(newTag: string): string[] {
    this.ensureInitialized();
    const clean = newTag.trim();
    if (!clean) return this.getCustomTags();

    const exists = this.customTags!.some(t => t.toLowerCase() === clean.toLowerCase());
    if (!exists) {
      this.customTags!.push(clean);
      try {
        mmkvStorage.setObject(CUSTOM_TAGS_STORAGE_KEY, this.customTags!);
      } catch (e) {
        console.warn('[TagLearningService] Failed to save custom tag:', e);
      }
    }
    return this.getCustomTags();
  }

  /**
   * Predicts tag for any transaction using:
   * 1. User memory
   * 2. Transaction semantics
   * 3. 30+ Indian merchant keywords
   */
  predict(
    merchant: string,
    body?: string,
    type: 'debit' | 'credit' = 'debit',
    isSalary: boolean = false
  ): string {
    this.ensureInitialized();
    return predictTagForTransaction(merchant, body, type, isSalary, this.learnedMap!);
  }
}

export const tagLearningService = new TagLearningService();
