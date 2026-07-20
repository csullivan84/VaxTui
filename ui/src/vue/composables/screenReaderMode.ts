import { ref, type Ref } from "vue";
import { getScreenReaderMode, setScreenReaderMode as persist } from "../../services/a11yPreferences";

const screenReaderMode: Ref<boolean> = ref(getScreenReaderMode());

export function useScreenReaderMode() {
  function setScreenReaderMode(on: boolean) {
    screenReaderMode.value = on;
    persist(on);
  }
  return { screenReaderMode, setScreenReaderMode };
}
