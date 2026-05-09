import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface UploadDropzoneProps {
  disabled: boolean;
  variant?: 'default' | 'hero';
  onUpload: (file: File) => void;
}

export default function UploadDropzone({ disabled, variant = 'default', onUpload }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const isHero = variant === 'hero';
  const title = disabled
    ? 'Threading your PDF into the library...'
    : dragging
      ? 'Release to start the upload'
      : isHero
        ? 'Add your PDF to the reading path'
        : 'Upload PDF';
  const hint = disabled
    ? 'Reading page count and preparing your project.'
    : dragging
      ? 'Ariadne will save the file and open it when ready.'
      : isHero
        ? 'Drop a PDF here, or click to choose from your computer.'
        : 'Drop a file or choose from your computer.';
  function fireUpload(file: File) {
    setPulsing(true);
    window.setTimeout(() => setPulsing(false), 600);
    onUpload(file);
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      fireUpload(file);
    }
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      fireUpload(file);
    }
  }

  const classes = [
    'upload-dropzone',
    isHero ? 'hero' : '',
    dragging ? 'dragging' : '',
    pulsing ? 'pulsing' : '',
    disabled ? 'is-uploading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        className={classes}
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        aria-busy={disabled}
      >
        <span className="upload-portal" aria-hidden="true">
          <UploadCloud className="upload-cloud-icon" size={25} strokeWidth={1.75} />
        </span>
        <span className="upload-copy">
          <span className="upload-title">{title}</span>
          <small>{hint}</small>
        </span>
        <span className="upload-progress" aria-hidden="true" />
      </button>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={pickFile} />
    </>
  );
}
