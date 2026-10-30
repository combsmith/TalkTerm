// @vitest-environment jsdom
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileDropZone } from './FileDropZone';

describe('FileDropZone', () => {
  it('renders children', () => {
    render(
      <FileDropZone onFilesDropped={vi.fn()}>
        <div>Content</div>
      </FileDropZone>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('has data-testid for targeting', () => {
    render(
      <FileDropZone onFilesDropped={vi.fn()}>
        <div>Content</div>
      </FileDropZone>,
    );
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument();
  });

  it('adds drag-active ring class on dragover', () => {
    render(
      <FileDropZone onFilesDropped={vi.fn()}>
        <div>Content</div>
      </FileDropZone>,
    );
    const dropZone = screen.getByTestId('file-drop-zone');
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain('ring-2');
  });

  it('removes drag-active ring class on dragleave', () => {
    render(
      <FileDropZone onFilesDropped={vi.fn()}>
        <div>Content</div>
      </FileDropZone>,
    );
    const dropZone = screen.getByTestId('file-drop-zone');
    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain('ring-2');
  });

  it('calls onFilesDropped with paths when files with non-empty paths are dropped', () => {
    const onFilesDropped = vi.fn();
    render(
      <FileDropZone onFilesDropped={onFilesDropped}>
        <div>Content</div>
      </FileDropZone>,
    );
    const dropZone = screen.getByTestId('file-drop-zone');

    const dropEvt = createEvent.drop(dropZone);
    Object.defineProperty(dropEvt, 'dataTransfer', {
      value: { files: [{ path: '/path/to/file.txt', name: 'file.txt' }] },
    });
    fireEvent(dropZone, dropEvt);

    expect(onFilesDropped).toHaveBeenCalledWith(['/path/to/file.txt']);
  });

  it('does not call onFilesDropped when all dropped file paths are empty', () => {
    const onFilesDropped = vi.fn();
    render(
      <FileDropZone onFilesDropped={onFilesDropped}>
        <div>Content</div>
      </FileDropZone>,
    );
    const dropZone = screen.getByTestId('file-drop-zone');

    const dropEvt = createEvent.drop(dropZone);
    Object.defineProperty(dropEvt, 'dataTransfer', {
      value: { files: [{ path: '', name: 'file.txt' }] },
    });
    fireEvent(dropZone, dropEvt);

    expect(onFilesDropped).not.toHaveBeenCalled();
  });

  it('handles null dataTransfer gracefully without throwing', () => {
    const onFilesDropped = vi.fn();
    render(
      <FileDropZone onFilesDropped={onFilesDropped}>
        <div>Content</div>
      </FileDropZone>,
    );
    const dropZone = screen.getByTestId('file-drop-zone');

    const dropEvt = createEvent.drop(dropZone);
    Object.defineProperty(dropEvt, 'dataTransfer', {
      value: null,
    });
    fireEvent(dropZone, dropEvt);

    expect(onFilesDropped).not.toHaveBeenCalled();
  });
});
