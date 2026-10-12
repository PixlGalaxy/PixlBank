import { pushApi } from '../api/push';

/**
 * Web Push on this device. PixlBank only offers it inside the installed app
 * (added to the home screen): that's the only place iOS allows it, and on a
 * computer the emails already cover it.
 */

export type PushState =
  /** The browser can't do Web Push at all (older iOS, some in-app browsers). */
  | 'unsupported'
  /** Opened in a browser tab rather than from the home screen. */
  | 'not-installed'
  /** The user (or the system) said no — only the device's settings can undo it. */
  | 'denied'
  | 'off'
  | 'on';

export function isInstalledApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag for home screen apps.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Registered at startup (main.tsx); it only shows notifications and caches nothing. */
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function pushState(): Promise<PushState> {
  if (!isInstalledApp()) return pushSupported() || isIos() ? 'not-installed' : 'unsupported';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Must run straight from a tap: iOS only shows its permission prompt in
 * response to one. Resolves to the resulting state.
 */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await pushApi.key();
  let subscription = await registration.pushManager.getSubscription();
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await pushApi.subscribe(subscription.toJSON());
  return 'on';
}

/** Stops notifications here, on the server and in the browser. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}
