/**
 * Hands a file made in the page to the browser as a download. Nothing is sent anywhere: the
 * text becomes an object URL that lives until the click has been handled.
 */
export function saveFile(name: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari reads the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
