'use client';

import { useEffect, useRef, useState } from 'react';

type MentionSuggestion = {
  user_id: string;
  sub: string;
  username: string;
  name: string;
  picture: string | null;
};

type ActiveMention = { start: number; query: string } | null;

function findActiveMention(value: string, caret: number): ActiveMention {
  const beforeCaret = value.slice(0, caret);
  const atIndex = beforeCaret.lastIndexOf('@');
  if (atIndex < 0) return null;

  const preceding = beforeCaret.slice(0, atIndex);
  if (preceding && /[\p{L}\p{N}_.+-]$/u.test(preceding)) return null;

  const query = beforeCaret.slice(atIndex + 1);
  if (!/^[\p{L}\p{N}_.-]{1,50}$/u.test(query)) return null;

  return { start: atIndex, query };
}

export default function MentionTextarea({
  id,
  name,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  ariaDescribedBy,
  ariaInvalid = false,
  textareaClassName,
  placeholder,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  textareaClassName?: string;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!activeMention) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/users/mention-search?q=${encodeURIComponent(activeMention.query)}`,
          { credentials: 'same-origin', cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const result = await response.json() as { users?: MentionSuggestion[] };
        setSuggestions(Array.isArray(result.users) ? result.users : []);
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeMention]);

  function handleChange(nextValue: string, caret: number) {
    onChange(nextValue);
    setActiveMention(findActiveMention(nextValue, caret));
  }

  function selectSuggestion(user: MentionSuggestion) {
    if (!activeMention) return;

    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const insertion = `@${user.username} `;
    const nextValue =
      value.slice(0, activeMention.start) +
      insertion +
      value.slice(caret);
    const nextCaret = activeMention.start + insertion.length;

    onChange(nextValue);
    setActiveMention(null);
    setSuggestions([]);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return (
    <div className="mention-textarea-wrap" style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        className={textareaClassName}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
        onClick={(event) => setActiveMention(findActiveMention(value, event.currentTarget.selectionStart))}
        onBlur={() => setActiveMention(null)}
        onKeyUp={(event) => {
          if (['ArrowUp', 'ArrowDown', 'Escape', 'Enter'].includes(event.key)) return;
          setActiveMention(findActiveMention(value, event.currentTarget.selectionStart));
        }}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        autoComplete="off"
        spellCheck
      />

      {activeMention && (loading || suggestions.length > 0) && (
        <div
          className="mention-suggestions"
          role="listbox"
          aria-label="Mention suggestions"
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            top: '100%',
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--background, #fff)',
            color: 'var(--foreground, #111)',
            border: '1px solid var(--border, #d1d5db)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.14)',
          }}
        >
          {loading && suggestions.length === 0 ? (
            <p style={{ padding: '10px 12px', margin: 0 }}>Searching accounts…</p>
          ) : suggestions.map((user) => (
            <button
              key={user.user_id}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(user)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                border: 0,
                borderBottom: '1px solid var(--border, #eee)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <strong>{user.name || 'HavenSocial user'}</strong>
              <span style={{ display: 'block', opacity: 0.7 }}>@{user.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
