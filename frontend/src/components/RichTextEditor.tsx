"use client";

import { useRef } from "react";

interface RichTextEditorProps {
  onChange: (html: string) => void;
  placeholder?: string;
}

// contentEditable + execCommand — deprecated but still universally
// supported; avoids pulling in a full editor library for this build.
export function RichTextEditor({ onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  function exec(command: string, arg?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    onChange(editorRef.current?.innerHTML ?? "");
  }

  return (
    <div className="rounded-lg bg-gray-50">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5">
        <ToolbarButton label="Undo" onClick={() => exec("undo")}>
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => exec("redo")}>
          <RedoIcon />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Bold" onClick={() => exec("bold")}>
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => exec("italic")}>
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => exec("underline")}>
          <span className="underline">U</span>
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Align left" onClick={() => exec("justifyLeft")}>
          <AlignIcon />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => exec("insertOrderedList")}>
          <ListIcon ordered />
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" onClick={() => exec("insertUnorderedList")}>
          <ListIcon />
        </ToolbarButton>
        <ToolbarButton label="Indent" onClick={() => exec("indent")}>
          <IndentIcon />
        </ToolbarButton>
        <ToolbarButton label="Outdent" onClick={() => exec("outdent")}>
          <IndentIcon flip />
        </ToolbarButton>
        <ToolbarButton label="Quote" onClick={() => exec("formatBlock", "blockquote")}>
          <QuoteIcon />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Strikethrough" onClick={() => exec("strikeThrough")}>
          <span className="line-through">S</span>
        </ToolbarButton>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
        data-placeholder={placeholder}
        className="min-h-[220px] px-3 py-3 text-sm text-gray-800 outline-none empty:before:pointer-events-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection focused
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-sm text-gray-500 hover:bg-gray-200 hover:text-gray-800"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-gray-200" />;
}

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7" />
    </svg>
  );
}
function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 7v6h-6" />
      <path d="M21 13a9 9 0 1 1-3-7" />
    </svg>
  );
}
function AlignIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="18" y2="18" />
    </svg>
  );
}
function ListIcon({ ordered = false }: { ordered?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      {ordered ? (
        <>
          <text x="2" y="8" fontSize="6" fill="currentColor" stroke="none">1</text>
          <text x="2" y="14" fontSize="6" fill="currentColor" stroke="none">2</text>
          <text x="2" y="20" fontSize="6" fill="currentColor" stroke="none">3</text>
        </>
      ) : (
        <>
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
function IndentIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="11" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
      <path d="m3 10 4 2-4 2" />
    </svg>
  );
}
function QuoteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M7 7c-2.2 0-4 1.8-4 4v6h6v-6H6.5C6.8 9.5 8 8.3 9.5 8V6C8.1 6.1 7 6.4 7 7Zm10 0c-2.2 0-4 1.8-4 4v6h6v-6h-2.5c.3-1.5 1.5-2.7 3-3V6c-1.4.1-2.5.4-2.5 1Z" />
    </svg>
  );
}
