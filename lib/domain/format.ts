/** Decimal text with thousands separators and trailing zeros trimmed to a minimum. Never a float. */
export function displayAmount(value: string, minimumDecimals = 2): string {
  const [whole, decimal = ''] = value.split('.');
  const fraction = decimal.replace(/0+$/, '').padEnd(minimumDecimals, '0');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}
