import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { ApprovalChainStep, BrandingSettings, NotificationRule, OrgSettings } from "../types";

export function useOrgSettings() {
  return useQuery({
    queryKey: ["settings", "organization"],
    queryFn: async () => {
      const res = await apiClient.get<OrgSettings>("/settings/organization");
      return res.data;
    },
  });
}

export function useUpdateOrgSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: OrgSettings) => {
      const res = await apiClient.put<OrgSettings>("/settings/organization", settings);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "organization"] }),
  });
}

// Read-only — the approval model is now fixed (single-level, Project Admin
// only, with Super Admin as a standing fallback), so there's nothing to PUT
// back; this just describes the current model for the Settings screen.
export function useApprovalChains() {
  return useQuery({
    queryKey: ["settings", "approval-chains"],
    queryFn: async () => {
      const res = await apiClient.get<ApprovalChainStep[]>("/settings/approval-chains");
      return res.data;
    },
  });
}

export function useNotificationRules() {
  return useQuery({
    queryKey: ["settings", "notification-rules"],
    queryFn: async () => {
      const res = await apiClient.get<NotificationRule[]>("/settings/notification-rules");
      return res.data;
    },
  });
}

export function useUpdateNotificationRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rules: NotificationRule[]) => {
      const res = await apiClient.put<NotificationRule[]>("/settings/notification-rules", { rules });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "notification-rules"] }),
  });
}

export function useBrandingSettings() {
  return useQuery({
    queryKey: ["settings", "branding"],
    queryFn: async () => {
      const res = await apiClient.get<BrandingSettings>("/settings/branding");
      return res.data;
    },
  });
}

export function useUpdateBrandingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branding: BrandingSettings) => {
      const res = await apiClient.put<BrandingSettings>("/settings/branding", branding);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "branding"] }),
  });
}
