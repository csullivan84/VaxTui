package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"shelley.exe.dev/providerauth"
)

const onboardingSettingKey = "onboarding_complete"

type onboardingResponse struct {
	Complete       bool        `json:"complete"`
	HasReadyModels bool        `json:"has_ready_models"`
	Models         []ModelInfo `json:"models"`
}

func (s *Server) handleGetOnboarding(w http.ResponseWriter, r *http.Request) {
	response, err := s.onboardingResponse(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleCompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	var request struct {
		OpenRouterAPIKey string `json:"openrouter_api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if key := strings.TrimSpace(request.OpenRouterAPIKey); key != "" {
		providerConfig, err := providerauth.SaveOpenRouterKey(s.providerStorePath, key)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := s.refreshModelCatalog(r.Context()); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		s.setStoredDefaultModel(providerauth.PreferredModel(providerConfig))
	}
	if err := s.db.SetSetting(r.Context(), onboardingSettingKey, "true"); err != nil {
		http.Error(w, fmt.Sprintf("save onboarding state: %v", err), http.StatusInternalServerError)
		return
	}
	response, err := s.onboardingResponse(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) onboardingResponse(r *http.Request) (onboardingResponse, error) {
	if s.predictableOnly {
		modelList := s.getModelList()
		markDefaultModel(modelList, s.effectiveDefaultModel(modelList))
		return onboardingResponse{Complete: true, Models: modelList}, nil
	}

	value, err := s.db.GetSetting(r.Context(), onboardingSettingKey)
	if err != nil {
		return onboardingResponse{}, fmt.Errorf("read onboarding state: %w", err)
	}
	modelList := s.getModelList()
	markDefaultModel(modelList, s.effectiveDefaultModel(modelList))
	response := onboardingResponse{Complete: value == "true", Models: modelList}
	for _, model := range modelList {
		if model.Ready && model.ID != "predictable" {
			response.HasReadyModels = true
			break
		}
	}
	return response, nil
}

func (s *Server) setStoredDefaultModel(model string) {
	s.defaultModelMu.Lock()
	defer s.defaultModelMu.Unlock()
	if s.defaultModel == "" || s.defaultModel == "predictable" {
		s.defaultModel = model
	}
}
