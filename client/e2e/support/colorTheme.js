import { expect } from '@playwright/test';

/**
 * Set the color theme without a page reload.
 * The app has no theme control in the shell. Profile holds the only control, and Profile needs live mode.
 * This helper saves the choice and sends the storage event that src/lib/theme.js listens for.
 */
export async function setColorTheme(page, theme) {
  await page.evaluate(value => {
    localStorage.setItem('dino-color-theme', value);
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'dino-color-theme',
      newValue: value
    }));
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
