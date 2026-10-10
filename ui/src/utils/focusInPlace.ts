export function focusInPlace(element: HTMLElement): void {
  if (element.tabIndex < 0 && !element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
  element.focus();
}
