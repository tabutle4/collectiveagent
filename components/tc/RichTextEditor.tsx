'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Pilcrow,
  Quote,
} from 'lucide-react'

/**
 * Props for RichTextEditor.
 *
 * The component is a controlled wrapper around Tiptap. It emits HTML
 * via `onChange` whenever the editor content changes. The parent owns
 * the canonical content and passes it back via `value`.
 *
 * Tiptap itself is uncontrolled internally. We sync `value` into the
 * editor only when it differs from the current editor content AND the
 * change came from the outside. Otherwise every onChange would trigger
 * a re-sync, causing cursor jumps.
 */
export interface RichTextEditorProps {
  /** The HTML content to render in the editor. */
  value: string
  /** Called whenever the editor content changes. Receives HTML. */
  onChange: (html: string) => void
  /** Toolbar variant. 'full' shows headings and lists. 'lite' is minimal. */
  variant?: 'full' | 'lite'
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string
  /** Disable all editing. */
  disabled?: boolean
  /** Min height of the content area. Default 200px. */
  minHeight?: number
}

export default function RichTextEditor({
  value,
  onChange,
  variant = 'full',
  placeholder,
  disabled = false,
  minHeight = 200,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Turn off features we do not need. StarterKit ships with a lot.
        // We keep bold, italic, lists, headings, blockquote, code,
        // horizontalRule, history. We turn off codeBlock because email
        // templates rarely need syntax-highlighted code.
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false, // Don't navigate when clicking inside the editor
        autolink: true, // Detect URLs typed by the user and wrap them
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || '',
        // Only show when the entire document is empty, not for every empty
        // block. This avoids placeholder text appearing mid-document.
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
      }),
    ],
    content: value || '',
    editable: !disabled,
    // Tiptap v3 defaults to SSR-safe rendering. `immediatelyRender: false`
    // prevents a server/client mismatch warning in Next.js App Router.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none`,
        style: `min-height: ${minHeight}px; padding: 12px 14px;`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Sync external value changes into the editor. We compare against the
  // current editor HTML to avoid feedback loops from our own onUpdate.
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  // Sync editable state.
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  if (!editor) {
    // During initial hydration the editor may be null. Render a placeholder
    // with the same height so the page layout does not jump.
    return (
      <div
        className="rounded-md border border-luxury-gray-5 bg-luxury-light"
        style={{ minHeight: minHeight + 52 }} // +52 accounts for toolbar row
      />
    )
  }

  return (
    <div className="rounded-md border border-luxury-gray-5 bg-luxury-light overflow-hidden">
      <Toolbar editor={editor} variant={variant} disabled={disabled} />
      <div className="bg-white">
        <EditorContent editor={editor} />
      </div>
      <style jsx global>{`
        .ProseMirror {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--luxury-gray-3, #9ca3af);
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0.5rem 0;
        }
        .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.5rem 0;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.25rem;
          margin: 0.5rem 0;
        }
        .ProseMirror ul {
          list-style-type: disc;
        }
        .ProseMirror ol {
          list-style-type: decimal;
        }
        .ProseMirror p {
          margin: 0.25rem 0;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #d4d4d4;
          padding-left: 0.75rem;
          color: #525252;
          margin: 0.5rem 0;
        }
        .ProseMirror a {
          color: #c49a6c;
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Toolbar
// ----------------------------------------------------------------------------

interface ToolbarProps {
  editor: Editor
  variant: 'full' | 'lite'
  disabled: boolean
}

function Toolbar({ editor, variant, disabled }: ToolbarProps) {
  const handleLink = () => {
    const previous = editor.getAttributes('link').href || ''
    const url = window.prompt('Link URL', previous)
    if (url === null) return // Cancel
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    // Basic validation. The backend validates more strictly.
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-luxury-gray-5 bg-luxury-gray-5/20">
      <ToolbarButton
        label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        disabled={disabled}
      >
        <Bold size={14} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        disabled={disabled}
      >
        <Italic size={14} strokeWidth={1.75} />
      </ToolbarButton>

      {variant === 'full' && (
        <>
          <div className="w-px h-4 bg-luxury-gray-5 mx-1" />
          <ToolbarButton
            label="Heading 1"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            disabled={disabled}
          >
            <Heading1 size={14} strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            disabled={disabled}
          >
            <Heading2 size={14} strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            label="Paragraph"
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive('paragraph')}
            disabled={disabled}
          >
            <Pilcrow size={14} strokeWidth={1.75} />
          </ToolbarButton>
        </>
      )}

      <div className="w-px h-4 bg-luxury-gray-5 mx-1" />
      <ToolbarButton
        label="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        disabled={disabled}
      >
        <List size={14} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        disabled={disabled}
      >
        <ListOrdered size={14} strokeWidth={1.75} />
      </ToolbarButton>

      {variant === 'full' && (
        <ToolbarButton
          label="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          disabled={disabled}
        >
          <Quote size={14} strokeWidth={1.75} />
        </ToolbarButton>
      )}

      <div className="w-px h-4 bg-luxury-gray-5 mx-1" />
      <ToolbarButton
        label="Link"
        onClick={handleLink}
        active={editor.isActive('link')}
        disabled={disabled}
      >
        <LinkIcon size={14} strokeWidth={1.75} />
      </ToolbarButton>

      <div className="flex-1" />

      <ToolbarButton
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
      >
        <Undo2 size={14} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
      >
        <Redo2 size={14} strokeWidth={1.75} />
      </ToolbarButton>
    </div>
  )
}

interface ToolbarButtonProps {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}

function ToolbarButton({ label, onClick, active, disabled, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`
        p-1.5 rounded transition-colors
        ${
          active
            ? 'bg-luxury-gray-5/80 text-luxury-gray-1'
            : 'text-luxury-gray-2 hover:bg-luxury-gray-5/40 hover:text-luxury-gray-1'
        }
        disabled:opacity-30 disabled:cursor-not-allowed
      `}
    >
      {children}
    </button>
  )
}
