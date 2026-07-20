// Vue port of components/ToolDetailContext.tsx.
// When a tool card is shown inside its own detail modal (opened from a tool
// pill), its collapsible body should start expanded. Inline in the
// conversation it starts collapsed. Provided by the detail-modal wrapper;
// tool components read it via useInToolDetail()/useToolExpanded().
//
// shelley-a11y: screen-reader mode forces default expanded so tool output is
// not hidden behind a chevron after completion.
import { inject, provide, ref, watch, type InjectionKey, type Ref } from "vue";
import { useScreenReaderMode } from "./screenReaderMode";

export const ToolDetailKey: InjectionKey<{ defaultExpanded: boolean }> = Symbol("tool-detail");

export function provideToolDetail(defaultExpanded: boolean) {
  provide(ToolDetailKey, { defaultExpanded });
}

/** True when this tool card is being shown in its own detail modal. */
export function useInToolDetail(): boolean {
  return inject(ToolDetailKey, { defaultExpanded: false }).defaultExpanded;
}

/** A ref for a tool card's expand/collapse, seeded from the detail context / SR mode. */
export function useToolExpanded(): Ref<boolean> {
  const { defaultExpanded } = inject(ToolDetailKey, { defaultExpanded: false });
  const { screenReaderMode } = useScreenReaderMode();
  const isExpanded = ref(defaultExpanded || screenReaderMode.value);

  watch(screenReaderMode, (on) => {
    if (on) isExpanded.value = true;
  });

  return isExpanded;
}
