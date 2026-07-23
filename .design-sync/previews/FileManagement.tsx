import { useState } from 'react';
import { FileManagement } from 'frontend';

export const Default = () => {
  const [newFiles, setNewFiles] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([
    { fileName: 'syllabus.pdf', url: '#' },
    { fileName: 'grading_rubric.docx', url: '#' },
    { fileName: 'case_notes_template.pdf', url: '#' },
  ]);
  const [savedFiles, setSavedFiles] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  return (
    <FileManagement
      newFiles={newFiles}
      setNewFiles={setNewFiles}
      files={files}
      setFiles={setFiles}
      setDeletedFiles={() => {}}
      savedFiles={savedFiles}
      setSavedFiles={setSavedFiles}
      loading={false}
      metadata={metadata}
      setMetadata={setMetadata}
      isDocument={true}
    />
  );
};

export const Empty = () => {
  const [newFiles, setNewFiles] = useState<any[]>([]);
  const [savedFiles, setSavedFiles] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  return (
    <FileManagement
      newFiles={newFiles}
      setNewFiles={setNewFiles}
      files={[]}
      setFiles={() => {}}
      setDeletedFiles={() => {}}
      savedFiles={savedFiles}
      setSavedFiles={setSavedFiles}
      loading={false}
      metadata={metadata}
      setMetadata={setMetadata}
      isDocument={false}
    />
  );
};

export const Loading = () => (
  <FileManagement
    newFiles={[]}
    setNewFiles={() => {}}
    files={[]}
    setFiles={() => {}}
    setDeletedFiles={() => {}}
    savedFiles={[]}
    setSavedFiles={() => {}}
    loading={true}
    metadata={{}}
    setMetadata={() => {}}
    isDocument={true}
  />
);
