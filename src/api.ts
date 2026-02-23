const BASE = '/api';

async function request<T>(url: string, options?: RequestInit & { skipAuthRedirect?: boolean }): Promise<T> {
  const { skipAuthRedirect, ...fetchOptions } = options || {};
  const res = await fetch(BASE + url, {
    credentials: 'include',
    ...fetchOptions,
    headers: {
      ...(!fetchOptions?.body || fetchOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...fetchOptions?.headers,
    },
  });
  if (res.status === 401) {
    if (!skipAuthRedirect && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || res.statusText);
  }
  return res.json();
}

export interface User {
  id: number;
  name: string;
  profileImage: string | null;
  role: string;
  createdAt: string;
}

export interface MediaItem {
  id: number;
  uploaderId: number;
  filename: string;
  originalName: string;
  mimeType: string;
  type: 'image' | 'video';
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
  uploaderName: string;
  uploaderImage: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  viewers: { userId: number; name: string; profileImage: string | null }[];
  downloaders: { userId: number; name: string; profileImage: string | null }[];
}

export interface Comment {
  id: number;
  content: string;
  createdAt: string;
  userId: number;
  name: string;
  profileImage: string | null;
}

export const api = {
  getMe: () => request<User>('/auth/me', { skipAuthRedirect: true }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  getMedia: (cursor?: number | null, sort?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', String(cursor));
    if (sort) params.set('sort', sort);
    const qs = params.toString();
    return request<{ items: MediaItem[]; nextCursor: number | null }>(
      `/media${qs ? `?${qs}` : ''}`,
    );
  },

  getMediaDetail: (id: number) => request<MediaItem>(`/media/${id}`),

  uploadFile: (file: File, onProgress?: (pct: number) => void) => {
    return new Promise<{ ok: boolean; filename?: string; duplicate?: boolean }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/media/upload`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error('Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));

      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  },

  deleteMedia: (id: number) => request<{ ok: boolean }>(`/media/${id}`, { method: 'DELETE' }),

  recordView: (id: number) => request<{ ok: boolean }>(`/media/${id}/view`, { method: 'POST' }),

  toggleLike: (id: number) => request<{ liked: boolean }>(`/media/${id}/like`, { method: 'POST' }),

  getComments: (id: number) => request<Comment[]>(`/media/${id}/comments`),

  addComment: (id: number, content: string) =>
    request<Comment>(`/media/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  deleteComment: (id: number) =>
    request<{ ok: boolean }>(`/comments/${id}`, { method: 'DELETE' }),

  getUsers: () => request<User[]>('/users'),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),

  thumbUrl: (id: number) => `${BASE}/media/${id}/thumb`,
  fileUrl: (id: number) => `${BASE}/media/${id}/file`,
  downloadUrl: (id: number) => `${BASE}/media/${id}/download`,
};
