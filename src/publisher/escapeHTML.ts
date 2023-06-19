export function escapeHTML(title: string) {
  return title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

