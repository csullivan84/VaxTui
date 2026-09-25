// shelley-a11y: tool cards start collapsed, except in screen-reader mode, which
// forces them expanded so tool output is not hidden behind a chevron.
import { ref, watch, type Ref } from "vue";
import { useScreenReaderMode } from "./screenReaderMode";

/** A ref for a tool card's expand/collapse, seeded from screen-reader mode. */
export function useToolExpanded(): Ref<boolean> {
  const { screenReaderMode } = useScreenReaderMode();
  const isExpanded = ref(screenReaderMode.value);

  watch(screenReaderMode, (on) => {
    if (on) isExpanded.value = true;
  });

  return isExpanded;
}
