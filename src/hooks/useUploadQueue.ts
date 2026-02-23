import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api';

export interface UploadFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

export function useUploadQueue(onUploaded: () => void) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const uploadingRef = useRef(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const items = Array.from(newFiles)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .map(file => ({ file, progress: 0, status: 'pending' as const }));
    if (items.length === 0) return;
    setFiles(prev => [...prev, ...items]);
  }, []);

  // 순차 업로드
  useEffect(() => {
    if (uploadingRef.current) return;
    const pendingIdx = files.findIndex(f => f.status === 'pending');
    if (pendingIdx === -1) return;

    uploadingRef.current = true;
    setFiles(prev => prev.map((f, i) => i === pendingIdx ? { ...f, status: 'uploading' } : f));

    const fileToUpload = files[pendingIdx].file;
    api.uploadFile(fileToUpload, (pct) => {
      setFiles(prev => prev.map((f, i) => i === pendingIdx ? { ...f, progress: pct } : f));
    })
      .then(() => {
        setFiles(prev => prev.map((f, i) => i === pendingIdx ? { ...f, status: 'done', progress: 100 } : f));
        onUploaded();
      })
      .catch(() => {
        setFiles(prev => prev.map((f, i) => i === pendingIdx ? { ...f, status: 'error' } : f));
      })
      .finally(() => {
        uploadingRef.current = false;
        setFiles(prev => [...prev]);
      });
  }, [files.length, files.filter(f => f.status === 'done' || f.status === 'error').length]);

  // beforeunload
  useEffect(() => {
    const hasActive = files.some(f => f.status === 'uploading' || f.status === 'pending');
    if (!hasActive) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [files]);

  const clearDone = useCallback(() => {
    setFiles(prev => prev.filter(f => f.status !== 'done' && f.status !== 'error'));
  }, []);

  const doneCount = files.filter(f => f.status === 'done').length;
  const totalCount = files.length;
  const activeCount = files.filter(f => f.status === 'uploading' || f.status === 'pending').length;
  const currentFile = files.find(f => f.status === 'uploading');

  return { files, addFiles, clearDone, doneCount, totalCount, activeCount, currentFile };
}
