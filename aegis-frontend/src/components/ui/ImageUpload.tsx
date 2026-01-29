import React, { useRef, useState, useEffect } from 'react'
import { Upload, X } from 'lucide-react'
import './ImageUpload.css'

type Props = {
  initialUrl?: string
  accept?: string
  uploadUrl?: string
  label?: string
  showUploadButton?: boolean
  onUpload?: (file: File, uploadedUrl?: string) => Promise<void> | void
}

export default function ImageUpload({ initialUrl, accept = 'image/*', uploadUrl, label, showUploadButton = true, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<string | undefined>(undefined)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    // Only set preview if initialUrl is explicitly provided and not empty
    if (initialUrl && initialUrl.trim() !== '') {
      setPreview(initialUrl)
    }
  }, [initialUrl])

  function openFilePicker() {
    inputRef.current?.click()
  }

  async function handleFile(file?: File) {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)

    if (uploadUrl) {
      try {
        setUploading(true)
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(uploadUrl, { method: 'POST', body: fd })
        if (res.ok) {
          const data = await res.json().catch(() => null)
          const uploadedUrl = data && (data.url || data.path) ? (data.url || data.path) : undefined
          await onUpload?.(file, uploadedUrl)
        } else {
          await onUpload?.(file)
        }
      } catch (e) {
        await onUpload?.(file)
      } finally {
        setUploading(false)
      }
    } else {
      await onUpload?.(file)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0]
    handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files && e.dataTransfer.files[0]
    handleFile(file)
  }

  function clear() {
    setPreview(undefined)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    onUpload?.(undefined as any)
  }

  return (
    <div
      className={`image-upload ${dragOver ? 'image-upload--drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {label && <div className="image-upload__label">{label}</div>}
      <input ref={inputRef} type="file" accept={accept} className="image-upload__input" onChange={onInputChange} />

      {preview ? (
        <>
          <div className="image-upload__preview">
            <img src={preview} alt="preview" />
          </div>
          <div className="image-upload__top">
            <button className="btn btn-small" onClick={openFilePicker} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Replace'}
            </button>
          </div>
          <div className="image-upload__controls">
            <button className="btn btn-ghost btn-small" onClick={clear}>
              <X size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className="image-upload__placeholder" onClick={openFilePicker}>
          <Upload className="image-upload__icon" size={48} />
          <div className="image-upload__prompt">
            {dragOver ? 'Drop image here' : 'Drag & drop an image here'}
          </div>
          <div className="image-upload__hint">or click to browse • JPG, PNG • Max 10MB</div>
          {showUploadButton && (
            <button className="btn" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Choose File'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
