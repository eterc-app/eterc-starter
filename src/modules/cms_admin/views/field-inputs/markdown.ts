import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Markdown pipeline used by the Markdown interface.
 *
 * GFM supplies tables, strikethrough, task lists and autolinks. Raw HTML is
 * dropped (never trusted), then the generated HAST is sanitized before it is
 * serialized, so links and images cannot inject executable protocols.
 */
const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize)
  .use(rehypeStringify);

export function markdown_to_html(source: string): string {
  if (source.trim() === "") return "";
  try {
    return String(markdownProcessor.processSync(source));
  } catch {
    return "";
  }
}
