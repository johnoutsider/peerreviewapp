'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface EssayEditorProps {
    value: string
    onChange: (text: string) => void
    disabled?: boolean
    minHeight?: string
    placeholder?: string
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolbarBtn({
    title,
    onClick,
    active,
    children,
}: {
    title: string
    onClick: () => void
    active?: boolean
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            title={title}
            onMouseDown={(e) => {
                // Prevent the editor from losing focus
                e.preventDefault()
                onClick()
            }}
            className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors select-none
                ${active
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-600  hover:bg-slate-200 '
                }`}
        >
            {children}
        </button>
    )
}

// ── EssayEditor ────────────────────────────────────────────────────────────────
export default function EssayEditor({
    value,
    onChange,
    disabled = false,
    minHeight = '420px',
    placeholder = 'Start writing your essay here…',
}: EssayEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null)

    // Track active formatting at the current cursor / selection
    const [activeFormats, setActiveFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
    })

    // Shared helper — reads current format state from the browser
    const updateFormats = useCallback(() => {
        setActiveFormats({
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
        })
    }, [])

    // Update toolbar highlight whenever the caret moves or selection changes
    useEffect(() => {
        document.addEventListener('selectionchange', updateFormats)
        return () => document.removeEventListener('selectionchange', updateFormats)
    }, [updateFormats])

    // Sync external value → editor (only on first mount or external reset)
    useEffect(() => {
        if (!editorRef.current) return
        const current = editorRef.current.innerText
        if (current !== value) {
            editorRef.current.innerText = value
        }
    }, [value])

    // Fire onChange with plain text on every input event
    const handleInput = useCallback(() => {
        if (!editorRef.current) return
        onChange(editorRef.current.innerText ?? '')
    }, [onChange])

    // Paste: strip rich formatting, insert plain text only
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
    }, [])

    // Drop: strip rich content, insert plain text only
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        const plain = e.dataTransfer.getData('text/plain')
        if (plain) document.execCommand('insertText', false, plain)
    }, [])

    // Format helpers — focus editor FIRST, then run command, then read updated state
    const exec = (cmd: string, value?: string) => {
        editorRef.current?.focus()           // must focus before execCommand
        document.execCommand(cmd, false, value)
        setTimeout(updateFormats, 0)         // read state after DOM settles
        handleInput()
    }

    const insertHorizontalRule = () => {
        exec('insertHTML', '<hr style="border:none;border-top:2px solid #64748b;margin:12px 0">')
    }

    const clearFormatting = () => {
        exec('removeFormat')
        if (editorRef.current) {
            const plain = editorRef.current.innerText
            editorRef.current.innerText = plain
            onChange(plain)
        }
        setTimeout(updateFormats, 0)
    }

    // Word / character count from the current value string
    const words = value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0
    const chars = value.length

    // Colour the word counter based on IELTS Task 2 minimum (250 words)
    const wordCountColour =
        words === 0
            ? 'text-slate-400'
            : words < 200
                ? 'text-red-400'
                : words < 250
                    ? 'text-orange-400'
                    : words < 350
                        ? 'text-green-400'
                        : 'text-blue-400'

    return (
        <div className={`flex flex-col rounded-xl border ${disabled ? 'border-yellow-500/30 opacity-60' : 'border-slate-200 '} overflow-hidden bg-white  shadow-sm`}>

            {/* ── Toolbar ── */}
            {!disabled && (
                <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-slate-200  bg-slate-50 ">

                    {/* Text style group */}
                    <ToolbarBtn title="Bold (Ctrl+B)" onClick={() => exec('bold')} active={activeFormats.bold}>
                        <span style={{ fontWeight: 700 }}>B</span>
                    </ToolbarBtn>
                    <ToolbarBtn title="Italic (Ctrl+I)" onClick={() => exec('italic')} active={activeFormats.italic}>
                        <span style={{ fontStyle: 'italic' }}>I</span>
                    </ToolbarBtn>
                    <ToolbarBtn title="Underline (Ctrl+U)" onClick={() => exec('underline')} active={activeFormats.underline}>
                        <span style={{ textDecoration: 'underline' }}>U</span>
                    </ToolbarBtn>

                    <div className="w-px h-5 bg-slate-300  mx-1" />

                    {/* Paragraph alignment */}
                    <ToolbarBtn title="Align Left" onClick={() => exec('justifyLeft')}>⬅</ToolbarBtn>
                    <ToolbarBtn title="Align Center" onClick={() => exec('justifyCenter')}>⬛</ToolbarBtn>
                    <ToolbarBtn title="Align Right" onClick={() => exec('justifyRight')}>➡</ToolbarBtn>

                    <div className="w-px h-5 bg-slate-300  mx-1" />

                    {/* Indentation */}
                    <ToolbarBtn title="Indent (Tab)" onClick={() => exec('indent')}>⇥ Indent</ToolbarBtn>
                    <ToolbarBtn title="Outdent" onClick={() => exec('outdent')}>⇤ Outdent</ToolbarBtn>

                    <div className="w-px h-5 bg-slate-300  mx-1" />

                    {/* Separator line */}
                    <ToolbarBtn title="Insert separator line" onClick={insertHorizontalRule}>— Line</ToolbarBtn>

                    {/* Clear formatting */}
                    <ToolbarBtn title="Remove all formatting" onClick={clearFormatting}>✕ Clear</ToolbarBtn>

                    {/* Right-aligned info badge */}
                    <span className="ml-auto text-xs text-slate-400  bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-full select-none">
                        🚫 Spell-check disabled
                    </span>
                </div>
            )}

            {/* ── Writing Area ── */}
            <div className="relative flex-1">
                {/* Placeholder */}
                {!value && (
                    <div
                        className="absolute top-5 left-6 right-6 text-slate-400  pointer-events-none select-none text-lg"
                        aria-hidden
                    >
                        {placeholder}
                    </div>
                )}

                <div
                    ref={editorRef}
                    contentEditable={!disabled}
                    suppressContentEditableWarning
                    onInput={handleInput}
                    onPaste={handlePaste}
                    onDrop={handleDrop}

                    // ── Grammar / correction tool restrictions ──
                    spellCheck={false}                 // browser spell check
                    autoCorrect="off"                  // iOS/macOS autocorrect
                    autoCapitalize="off"               // iOS autocapitalise
                    // @ts-ignore – non-standard Grammarly attrs
                    data-gramm="false"                 // Grammarly
                    data-gramm_editor="false"          // Grammarly
                    data-enable-grammarly="false"      // Grammarly
                    data-lt-active="false"             // LanguageTool

                    style={{ minHeight, outline: 'none' }}
                    className={`w-full px-6 py-5 text-slate-900  text-lg leading-relaxed focus:outline-none font-['Georgia',serif] ${disabled ? 'cursor-not-allowed' : ''}`}
                />
            </div>

            {/* ── Status Bar ── */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200  bg-slate-50  text-xs">
                <div className="flex items-center gap-4">
                    <span className={`font-semibold ${wordCountColour}`}>
                        📝 {words} words
                        {words > 0 && words < 250 && (
                            <span className="text-slate-400 font-normal ml-1">
                                ({250 - words} more to reach 250 min)
                            </span>
                        )}
                        {words >= 250 && (
                            <span className="text-green-400 font-normal ml-1">✓ Minimum met</span>
                        )}
                    </span>
                    <span className="text-slate-400">{chars} characters</span>
                </div>
                {words >= 250 && words <= 400 && (
                    <span className="text-green-400 font-medium">✓ Good length</span>
                )}
                {words > 400 && (
                    <span className="text-blue-400 font-medium">Well developed</span>
                )}
            </div>
        </div>
    )
}
