
export const node = (tag: string, attrs: Record<string, string>, children: string[]) => {

  return `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}>${children.join('')}</${tag}>`;

}
