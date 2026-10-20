/**
 * default_css view - port of modules/pagination/views/default_css.php.
 *
 * The PHP view returned a <style> block. Eterc owns pagination styling in the
 * single Tailwind layer, so the compatibility view intentionally renders
 * nothing; keeping the route preserves the PHP module contract.
 */
export default function DefaultCss() {
  return null;
}
