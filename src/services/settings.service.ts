import { supabaseAdmin } from '../utils/supabaseClient';

class SettingsService {
  private cache: Map<string, string> = new Map();
  private cacheTimestamp: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch all settings from database
   */
  async fetchAllSettings(): Promise<Map<string, string>> {
    const now = Date.now();
    
    // Return cached settings if still valid
    if (now - this.cacheTimestamp < this.cacheTTL && this.cache.size > 0) {
      return this.cache;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('settings')
        .select('key, value');

      if (error) {
        console.error('Error fetching settings:', error);
        return this.cache; // Return cached settings on error
      }

      // Update cache
      this.cache.clear();
      data?.forEach((setting) => {
        if (setting.value !== null) {
          this.cache.set(setting.key, setting.value);
        }
      });
      this.cacheTimestamp = now;

      return this.cache;
    } catch (error) {
      console.error('Error fetching settings:', error);
      return this.cache; // Return cached settings on error
    }
  }

  /**
   * Get a single setting value by key
   */
  async getSetting(key: string): Promise<string | null> {
    const settings = await this.fetchAllSettings();
    return settings.get(key) || null;
  }

  async getNumberSetting(key: string, defaultValue: number): Promise<number> {
    const raw = await this.getSetting(key);
    if (raw === null || raw === undefined) {
      return defaultValue;
    }

    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      return defaultValue;
    }

    return parsed;
  }

  /**
   * Check if a boolean setting is enabled
   */
  async isEnabled(key: string): Promise<boolean> {
    const value = await this.getSetting(key);
    return value === 'true';
  }

  /**
   * Clear cache (useful after settings update)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamp = 0;
  }
}

export const settingsService = new SettingsService();

