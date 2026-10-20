import { DEFAULT_CSS } from "../default_css";

/**
 * default_css view — port of modules/pagination/views/default_css.php.
 * The PHP view returned a <style> block; include_css rendering also uses the
 * same string (see ../default_css.ts).
 */
export default function DefaultCss() {
  return <style>{DEFAULT_CSS.replace(/^<style>|<\/style>$/g, "")}</style>;
}
