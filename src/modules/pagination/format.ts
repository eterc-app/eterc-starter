export function format_number(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}
