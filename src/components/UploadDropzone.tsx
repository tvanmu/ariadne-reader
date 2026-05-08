import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface UploadDropzoneProps {
  disabled: boolean;
  onUpload: (file: File) => void;
}

export default function UploadDropzone({ disabled, onUpload }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      onUpload(file);
    }
  }

  return (
    <>
      <button
        className={`upload-dropzone ${dragging ? 'dragging' : ''}`}
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
        <UploadCloud size={24} />
        <span>{disabled ? 'Preparing PDF...' : 'Upload PDF'}</span>
        <small>Drop a file or choose from your computer</small>
      </button>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={pickFile} />
    </>
  );
}
