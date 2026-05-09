import { ChangeEvent, DragEvent, useRef, useState } from 'react';

interface UploadDropzoneProps {
  disabled: boolean;
  variant?: 'default' | 'hero';
  onUpload: (file: File) => void;
}

export default function UploadDropzone({ disabled, variant = 'default', onUpload }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pulsing, setPulsing] = useState(false);

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
    variant === 'hero' ? 'hero' : '',
    dragging ? 'dragging' : '',
    pulsing ? 'pulsing' : '',
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
      >
        <i className="drop-thread" aria-hidden="true" />
        <span>
          {disabled
            ? 'Preparing your PDF...'
            : variant === 'hero'
              ? 'Drop a PDF to add it to your library'
              : 'Upload PDF'}
        </span>
        <small>
          {variant === 'hero'
            ? 'Or click to choose from your computer'
            : 'Drop a file or choose from your computer'}
        </small>
      </button>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={pickFile} />
    </>
  );
}
