<template>
  <main class="onboarding-page">
    <section class="onboarding-card" aria-labelledby="onboarding-title">
      <div class="onboarding-mark" aria-hidden="true">S</div>
      <h1 id="onboarding-title">Set up Shelley</h1>
      <p class="onboarding-intro">
        Connect a model provider once, then use the ordinary message box for every request.
      </p>

      <form @submit.prevent="complete()">
        <div class="provider-group">
          <label class="openrouter-label" for="openrouter-key">OpenRouter API key</label>
          <p id="openrouter-help" class="provider-help">Stored only on this machine.</p>
          <input
            id="openrouter-key"
            v-model="openRouterKey"
            class="openrouter-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="openrouter-help"
            placeholder="sk-or-v1-…"
          />
        </div>

        <p v-if="error" class="onboarding-error" role="alert">{{ error }}</p>

        <div class="onboarding-actions">
          <Button
            type="submit"
            label="Start using Shelley"
            :loading="submitting"
            :disabled="!canContinue || submitting"
          />
          <Button
            v-if="!canContinue"
            type="button"
            label="Continue without a provider"
            severity="secondary"
            :loading="submitting"
            :disabled="submitting"
            @click="complete(true)"
          />
          <span v-if="status.has_ready_models" class="existing-provider-note">
            Shelley already has a ready provider, so a key is optional.
          </span>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import type { OnboardingStatus } from "../../services/api";
import { api } from "../../services/api";

const props = defineProps<{ status: OnboardingStatus }>();
const emit = defineEmits<{ complete: [status: OnboardingStatus] }>();

const openRouterKey = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);
const canContinue = computed(
  () => openRouterKey.value.trim() !== "" || props.status.has_ready_models,
);

async function complete(skipProvider = false) {
  if ((!canContinue.value && !skipProvider) || submitting.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const result = await api.completeOnboarding({
      openrouter_api_key: openRouterKey.value.trim(),
    });
    openRouterKey.value = "";
    emit("complete", result);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Failed to configure providers";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.onboarding-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem;
  background: var(--surface-ground);
  color: var(--text-color);
}

.onboarding-card {
  width: min(42rem, 100%);
  padding: clamp(1.5rem, 5vw, 3rem);
  border: 1px solid var(--surface-border);
  border-radius: 1rem;
  background: var(--surface-card);
  box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 12%);
}

.onboarding-mark {
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  margin-bottom: 1rem;
  border-radius: 0.75rem;
  background: var(--primary-color);
  color: var(--primary-color-text);
  font-weight: 700;
  font-size: 1.25rem;
}

h1 {
  margin: 0;
  font-size: clamp(1.75rem, 5vw, 2.5rem);
}

.onboarding-intro {
  margin: 0.65rem 0 2rem;
  color: var(--text-color-secondary);
  font-size: 1.05rem;
  line-height: 1.5;
}

.provider-group {
  margin: 0 0 1.5rem;
  padding: 0;
  border: 0;
}

.openrouter-label {
  display: block;
  margin-bottom: 0.3rem;
  font-weight: 650;
}

.provider-help {
  margin: 0 0 0.75rem;
  color: var(--text-color-secondary);
  font-size: 0.9rem;
  line-height: 1.4;
}

.existing-provider-note {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
}

.openrouter-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--surface-border);
  border-radius: 0.5rem;
  background: var(--surface-ground);
  color: var(--text-color);
  font: inherit;
}

.openrouter-input:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.onboarding-error {
  color: var(--red-500);
}

.onboarding-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.8rem;
}
</style>
