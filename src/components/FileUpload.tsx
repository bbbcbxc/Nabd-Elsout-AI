import React, { useCallback } from 'react';
import { useDropzone, FileWithPath } from 'react-dropzone';
import { Upload, FileText, X } from 'lucide-react';

interface FileUploadProps {
  file: File | null;
  onFileUpload: (file: File) => void;
  onFileRemove: () => void;
  isProcessing: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ file, onFileUpload, onFileRemove, isProcessing }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && !isProcessing) {
      onFileUpload(acceptedFiles[0]);
    }
  }, [onFileUpload, isProcessing]);

  const currentFile = file;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    disabled: isProcessing || !!currentFile
  });

  return (
    <div className="space-y-4">
      {!currentFile && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400'}
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          {isDragActive ? (
            <p className="text-sm text-gray-600">Drop your file here...</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Drag & drop PDF or text files here, or click to select
              </p>
              <p className="text-xs text-gray-500">
                Supported formats: PDF, TXT
              </p>
            </div>
          )}
        </div>
      )}

      {currentFile && (
        <div className="flex items-center justify-between p-3 bg-gray-100 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <span className="text-sm text-gray-700 truncate" title={currentFile.name}>{currentFile.name}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileRemove();
            }}
            className="p-1 hover:bg-gray-200 rounded-full flex-shrink-0 ml-2"
            title="Remove file"
            disabled={isProcessing}
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}
    </div>
  );
};