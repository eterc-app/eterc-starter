"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { CmsField } from "@/modules/cms/cms-types";
import { upload_image, is_image_file } from "./media";
import { as_string, option_string, type CmsMediaConfig } from "./types";

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    link: false,
    underline: false,
  }),
  Link.configure({ openOnClick: false, autolink: true }),
  TextAlign.configure({
    types: ["heading", "paragraph"],
    alignments: ["left", "center", "right"],
  }),
  Image.configure({ allowBase64: false, inline: false }),
];

function editor_link_url(value: string): string {
  const url = value.trim();
  if (/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#|\.\.?\/)/i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return "";
}

function editor_image_url(value: string): string {
  const url = value.trim();
  if (/^(https?:\/\/|\/(?!\/)|\.\.?\/)/i.test(url)) return url;
  return "";
}

function ToolbarButton({
  editor,
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  editor: Editor;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: (editor: Editor) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onClick(editor)}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        active && "bg-secondary text-foreground"
      )}
    >
      {children}
    </button>
  );
}

interface ToolbarItem {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  run: (editor: Editor) => boolean;
}

export function WysiwygInput({
  field,
  value,
  onChange,
  disabled,
  media,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  media?: CmsMediaConfig;
}) {
  const current = as_string(value);
  const placeholder =
    option_string(field, "placeholder") || "Write content...";
  const folder = option_string(field, "folder");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(current);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    content: current || "",
    extensions: EDITOR_EXTENSIONS,
    editorProps: {
      attributes: {
        class: "prose-editor tiptap-editor",
        "aria-label": field.label || field.name,
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const html = updatedEditor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || sourceMode) return;
    if (editor.getHTML() !== (current || "<p></p>")) {
      editor.commands.setContent(current || "", { emitUpdate: false });
    }
  }, [current, editor, sourceMode]);

  if (!editor) {
    return (
      <div className="flex min-h-60 items-center justify-center rounded-lg border border-input bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading editor...
      </div>
    );
  }

  const apply_source = (html: string) => {
    setSourceValue(html);
    editor.commands.setContent(html || "", { emitUpdate: false });
    const safeHtml = editor.getHTML();
    onChange(safeHtml === "<p></p>" ? "" : safeHtml);
  };

  const insert_image = (url: string, alt: string) => {
    editor
      .chain()
      .focus()
      .setImage({ src: url, alt: alt.trim() })
      .run();
    setImageUrl("");
    setImageAlt("");
    setImageOpen(false);
  };

  const submit_image_url = () => {
    const url = editor_image_url(imageUrl);
    if (!url) {
      toast.error("Enter a valid image URL.");
      return;
    }
    insert_image(url, imageAlt);
  };

  const insert_link = () => {
    const href = editor_link_url(linkUrl);
    if (!href) {
      toast.error("Enter a valid link URL.");
      return;
    }
    if (editor.state.selection.empty) {
      const label = linkText.trim() || href;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
    setLinkText("");
  };

  const on_image_file = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!is_image_file(file)) {
      toast.error("Choose a JPG, PNG, GIF, or WEBP image.");
      return;
    }
    if (!media) {
      toast.error("Image uploads are not configured on this page.");
      return;
    }
    setSourceMode(false);
    setUploading(true);
    setUploadProgress(0);
    void upload_image(file, media, folder, setUploadProgress)
      .then((image) => {
        insert_image(image.url, imageAlt || image.title || file.name);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "The image could not be uploaded."
        );
      })
      .finally(() => {
        setUploading(false);
        setUploadProgress(0);
      });
  };

  const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
  const toolbar_groups: ToolbarItem[][] = [
    [
      { label: "Undo", icon: <Undo2 className="size-4" />, run: (e: Editor) => e.chain().focus().undo().run(), disabled: !editor.can().undo() },
      { label: "Redo", icon: <Redo2 className="size-4" />, run: (e: Editor) => e.chain().focus().redo().run(), disabled: !editor.can().redo() },
    ],
    [
      { label: "Paragraph", icon: <Pilcrow className="size-4" />, active: editor.isActive("paragraph"), run: (e: Editor) => e.chain().focus().setParagraph().run() },
      { label: "Heading 1", icon: <Heading1 className="size-4" />, active: editor.isActive("heading", { level: 1 }), run: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
      { label: "Heading 2", icon: <Heading2 className="size-4" />, active: editor.isActive("heading", { level: 2 }), run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
      { label: "Heading 3", icon: <Heading3 className="size-4" />, active: editor.isActive("heading", { level: 3 }), run: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
    ],
    [
      { label: "Bold", icon: <Bold className="size-4" />, active: editor.isActive("bold"), run: (e: Editor) => e.chain().focus().toggleBold().run() },
      { label: "Italic", icon: <Italic className="size-4" />, active: editor.isActive("italic"), run: (e: Editor) => e.chain().focus().toggleItalic().run() },
      { label: "Underline", icon: <Underline className="size-4" />, active: editor.isActive("underline"), run: (e: Editor) => e.chain().focus().toggleUnderline().run() },
      { label: "Strikethrough", icon: <Strikethrough className="size-4" />, active: editor.isActive("strike"), run: (e: Editor) => e.chain().focus().toggleStrike().run() },
    ],
    [
      { label: "Bullet list", icon: <List className="size-4" />, active: editor.isActive("bulletList"), run: (e: Editor) => e.chain().focus().toggleBulletList().run() },
      { label: "Numbered list", icon: <ListOrdered className="size-4" />, active: editor.isActive("orderedList"), run: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
      { label: "Quote", icon: <Quote className="size-4" />, active: editor.isActive("blockquote"), run: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
      { label: "Code block", icon: <Code2 className="size-4" />, active: editor.isActive("codeBlock"), run: (e: Editor) => e.chain().focus().toggleCodeBlock().run() },
      { label: "Divider", icon: <Minus className="size-4" />, run: (e: Editor) => e.chain().focus().setHorizontalRule().run() },
    ],
    [
      { label: "Align left", icon: <AlignLeft className="size-4" />, active: editor.isActive({ textAlign: "left" }), run: (e: Editor) => e.chain().focus().setTextAlign("left").run() },
      { label: "Align center", icon: <AlignCenter className="size-4" />, active: editor.isActive({ textAlign: "center" }), run: (e: Editor) => e.chain().focus().setTextAlign("center").run() },
      { label: "Align right", icon: <AlignRight className="size-4" />, active: editor.isActive({ textAlign: "right" }), run: (e: Editor) => e.chain().focus().setTextAlign("right").run() },
    ],
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-card">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={on_image_file}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-2 py-1">
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant={!sourceMode ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            aria-pressed={!sourceMode}
            disabled={uploading}
            onClick={() => setSourceMode(false)}
          >
            Visual
          </Button>
          <Button
            type="button"
            variant={sourceMode ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            aria-pressed={sourceMode}
            disabled={disabled || uploading}
            onClick={() => {
              setSourceValue(editor.getHTML());
              setSourceMode(true);
            }}
          >
            <Code2 className="size-3.5" />
            HTML
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Insert link"
            aria-label="Insert link"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setLinkOpen((open) => !open)}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Link2 className="size-4" />
          </button>
          <button
            type="button"
            title="Insert image"
            aria-label="Insert image"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setImageOpen((open) => !open)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50",
              imageOpen && "bg-secondary text-foreground"
            )}
          >
            <ImagePlus className="size-4" />
          </button>
        </div>
      </div>
      {!sourceMode ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-subtle px-1.5 py-1">
          {toolbar_groups.map((group, index) => (
            <div key={index} className="flex items-center gap-0.5">
              {index > 0 ? <span className="mx-1 h-5 w-px bg-border" /> : null}
              {group.map((item) => (
                <ToolbarButton
                  key={item.label}
                  editor={editor}
                  label={item.label}
                  active={item.active}
                  disabled={disabled || item.disabled}
                  onClick={item.run}
                >
                  {item.icon}
                </ToolbarButton>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {!sourceMode && linkOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-2">
          <Input
            value={linkUrl}
            disabled={disabled}
            placeholder="https://example.com"
            aria-label="Link URL"
            className="h-8 min-w-40 flex-1 text-xs"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                insert_link();
              }
            }}
          />
          {editor.state.selection.empty ? (
            <Input
              value={linkText}
              disabled={disabled}
              placeholder="Link text"
              aria-label="Link text"
              className="h-8 min-w-32 flex-1 text-xs"
              onChange={(event) => setLinkText(event.target.value)}
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!editor_link_url(linkUrl) || disabled}
            onClick={insert_link}
          >
            Insert link
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => setLinkOpen(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      {!sourceMode && imageOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-2">
          <Input
            value={imageUrl}
            disabled={disabled || uploading}
            placeholder="Image URL"
            aria-label="Image URL"
            className="h-8 min-w-40 flex-1 text-xs"
            onChange={(event) => setImageUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit_image_url();
              }
            }}
          />
          <Input
            value={imageAlt}
            disabled={disabled || uploading}
            placeholder="Alt text"
            aria-label="Image alt text"
            className="h-8 min-w-32 flex-1 text-xs"
            onChange={(event) => setImageAlt(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!editor_image_url(imageUrl) || disabled}
            onClick={submit_image_url}
          >
            Insert URL
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!media || disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus className="size-3.5" />
            )}
            {uploading ? `${uploadProgress}%` : "Upload"}
          </Button>
        </div>
      ) : null}
      {sourceMode ? (
        <textarea
          value={sourceValue}
          disabled={disabled}
          aria-label={`${field.label || field.name} HTML source`}
          spellCheck={false}
          className="app-scrollbar min-h-60 w-full resize-y bg-card px-3 py-2.5 font-mono text-xs leading-5 text-foreground outline-none disabled:bg-muted"
          onChange={(event) => apply_source(event.target.value)}
        />
      ) : (
        <div className="relative">
          <EditorContent editor={editor} />
          {editor.isEmpty ? (
            <span className="pointer-events-none absolute left-4 top-3 text-sm text-muted-foreground">
              {placeholder}
            </span>
          ) : null}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-subtle px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {words.toLocaleString()} word{words === 1 ? "" : "s"} ·{" "}
          {current.length.toLocaleString()} characters
        </span>
        <span>{sourceMode ? "HTML source" : "Rich text"}</span>
      </div>
    </div>
  );
}
