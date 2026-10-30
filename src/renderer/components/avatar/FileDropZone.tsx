import { useState, useCallback, type ReactElement, type DragEvent } from 'react';

interface FileDropZoneProps {
  onFilesDropped: (paths: string[]) => void;
  children: ReactElement;
}

export function FileDropZone({ onFilesDropped, children }: FileDropZoneProps): ReactElement {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent): void => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((): void => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent): void => {
      e.preventDefault();
      setIsDragging(false);
      const dataTransfer = e.dataTransfer as DataTransfer | null;
      if (dataTransfer === null) return;
      const files = Array.from(dataTransfer.files);
      const paths = files.map((f) => f.path).filter((p) => p !== '');
      if (paths.length > 0) {
        onFilesDropped(paths);
      }
    },
    [onFilesDropped],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`transition-colors ${isDragging ? 'ring-2 ring-primary ring-inset' : ''}`}
      data-testid="file-drop-zone"
    >
      {children}
    </div>
  );
}
