import { useEffect, useRef } from 'react';
import { api } from '../api';

export function usePushNotification(isLoggedIn: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || registered.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    registered.current = true;
    setupPush();
  }, [isLoggedIn]);
}

async function setupPush() {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    // VAPID 키 가져오기
    const { key } = await fetch('/api/push/vapid-key').then(r => r.json());
    if (!key) return;

    // 이미 구독 중인지 확인
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      // 알림 권한 요청
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // 구독
      sub = await reg.pushManager.subscribe({
        userNotificationOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    // 서버에 구독 정보 전송
    await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(sub.getKey('p256dh')!),
          auth: arrayBufferToBase64(sub.getKey('auth')!),
        },
      }),
    });
  } catch (err) {
    console.warn('Push setup failed:', err);
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
